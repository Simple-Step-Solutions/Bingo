const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('node:crypto');

const { db, callableOpts } = require('./lib/db');
const { requireVerifiedEmail, requireRole, writeAudit, fingerprint } = require('./lib/guards');
const { consume } = require('./lib/ratelimit');

/**
 * Invites (Phase 2e).
 *
 * Three problems with the previous design, all closed here:
 *
 *   1. `invites` was listable by every authenticated user, so a player could
 *      dump every invite token and replay a chamber one. Documents are now
 *      keyed by sha256(token) and the collection is unreadable, so no query is
 *      ever needed and a leak yields hashes rather than working tokens.
 *
 *   2. Tokens came from Math.random(), which is seeded predictably and is not a
 *      CSPRNG. 160 bits from crypto.randomBytes now.
 *
 *   3. Redemption was enforced only in RoleSelector.tsx, a client component.
 *      The user could simply write role: 'chamber' themselves.
 */

const INVITE_TTL_HOURS = 48;

// The default only pre-fills the interactive prompt. firebase-tools checks the
// dotenv files first and, under --non-interactive, fails on any param missing
// from them before it ever reads this default -- so the real value has to live
// in functions/.env.sss-hvgcc-bingo, and does.
const ADMIN_EMAIL = defineString('BOOTSTRAP_ADMIN_EMAIL', {
  default: 'logan@simplestepsolutions.com',
});

const tokenHash = (token) =>
  crypto.createHash('sha256').update(`chamber-bingo-invite:v1:${String(token).trim()}`).digest('hex');

const newToken = () => crypto.randomBytes(20).toString('base64url');

const isExpired = (data) => {
  if (!data.expiresAt) return false;
  const ms = typeof data.expiresAt === 'string'
    ? Date.parse(data.expiresAt)
    : data.expiresAt.toDate().getTime();
  return Number.isFinite(ms) && ms < Date.now();
};

/**
 * Issue an invite.
 *
 * Chamber invites are admin-only. A chamber account that can mint more chamber
 * accounts is a root of trust for the whole system, which defeats the point of
 * having the role at all.
 */
exports.createInvite = onCall(callableOpts(), async (request) => {
  const { uid, role: actorRole, profile } = await requireRole(request, 'chamber');
  const { role, businessId, businessName, emailHint } = request.data || {};

  if (!['player', 'business', 'chamber'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Pick a valid role for the invite.');
  }
  if (role === 'chamber' && actorRole !== 'admin') {
    throw new HttpsError('permission-denied', 'Only an admin can invite chamber staff.');
  }
  if (role === 'business') {
    if (typeof businessId !== 'string' || !businessId) {
      throw new HttpsError('invalid-argument', 'Choose which business this invite is for.');
    }
    const bizSnap = await db().collection('businesses').doc(businessId).get();
    if (!bizSnap.exists) throw new HttpsError('not-found', 'No such business.');
  }
  if (emailHint != null && (typeof emailHint !== 'string' || emailHint.length > 254)) {
    throw new HttpsError('invalid-argument', 'That email does not look right.');
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);

  await db().collection('invites').doc(tokenHash(token)).set({
    role,
    businessId: businessId || null,
    businessName: businessName || null,
    // Stored lowercased because the comparison at redemption is case-insensitive.
    emailHint: emailHint ? String(emailHint).trim().toLowerCase() : null,
    createdBy: uid,
    createdByEmail: (profile && profile.email) || '',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    used: false,
    revoked: false,
  });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole,
    action: 'create_invite',
    targetUid: businessId || 'n/a',
    details: { role, businessName: businessName || null, emailHint: emailHint || null },
  });

  // The only time the plaintext token is ever returned. InviteManager shows the
  // link now or never -- there is no way to recover it later, which is the
  // point. That is why the UI offers Revoke and Reissue instead of Copy Link
  // for historical invites.
  return { token, expiresAt: expiresAt.toISOString() };
});

/**
 * Validity check for the signup banner.
 *
 * Deliberately unauthenticated: the banner renders before an account exists.
 * That makes it the one token-validity oracle in the system, so it returns a
 * whitelisted projection and nothing else, and it is rate limited by IP.
 * App Check should be enforced here first when Phase 7 turns it on.
 */
exports.peekInvite = onCall(callableOpts({ maxInstances: 20 }), async (request) => {
  const fp = fingerprint(request);
  await consume(`peek_${fp.ip || 'unknown'}`, { limit: 20, windowSeconds: 300 });

  const token = request.data && request.data.token;
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false };
  }

  const snap = await db().collection('invites').doc(tokenHash(token)).get();
  if (!snap.exists) return { valid: false };

  const data = snap.data();
  if (data.used || data.revoked || isExpired(data)) return { valid: false };

  // Whitelisted projection. Never return createdBy, emailHint, or anything else
  // that would leak who is being onboarded to whoever holds the link.
  return {
    valid: true,
    role: data.role,
    businessName: data.businessName || null,
  };
});

/**
 * Redeem an invite and take the role it grants.
 *
 * Transactional against the invite document so a token cannot be redeemed twice
 * concurrently. Sets the custom claim directly as well as the user document, so
 * the client can call getIdToken(true) immediately and not race the
 * syncRoleClaims trigger.
 */
exports.redeemInvite = onCall(callableOpts(), async (request) => {
  const auth = requireVerifiedEmail(request);
  const uid = auth.uid;
  const email = (auth.token.email || '').toLowerCase();

  await consume(`redeem_${uid}`, { limit: 10, windowSeconds: 600 });

  const token = request.data && request.data.token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new HttpsError('invalid-argument', 'That invite link is not valid.');
  }

  const inviteRef = db().collection('invites').doc(tokenHash(token));
  const userRef = db().collection('users').doc(uid);

  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That invite link is not valid.');

    const data = snap.data();
    if (data.used) throw new HttpsError('failed-precondition', 'That invite has already been used.');
    if (data.revoked) throw new HttpsError('failed-precondition', 'That invite was revoked.');
    if (isExpired(data)) throw new HttpsError('failed-precondition', 'That invite has expired.');

    if (data.emailHint && data.emailHint !== email) {
      throw new HttpsError('permission-denied',
        'This invite was issued to a different email address.');
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'Finish signing up first.');

    tx.update(inviteRef, {
      used: true,
      usedBy: uid,
      usedByEmail: email,
      usedAt: FieldValue.serverTimestamp(),
    });

    tx.set(userRef, {
      role: data.role,
      roleSelected: true,
      ...(data.businessId ? { businessId: data.businessId } : {}),
      ...(data.role !== 'player' ? { onboardingComplete: true } : {}),
    }, { merge: true });

    return { role: data.role, businessId: data.businessId || null };
  });

  // Claims, set here rather than waiting for the trigger, so the client can
  // refresh its token straight away.
  const user = await getAuth().getUser(uid);
  const next = { ...(user.customClaims || {}) };
  if (result.role === 'player') delete next.role; else next.role = result.role;
  if (result.businessId) next.bid = result.businessId; else delete next.bid;
  await getAuth().setCustomUserClaims(uid, next);

  await writeAudit({
    actorUid: uid,
    actorEmail: email,
    actorRole: result.role,
    action: 'redeem_invite',
    targetUid: uid,
    targetEmail: email,
    details: { role: result.role, businessId: result.businessId, ...fingerprint(request) },
  });

  return { ok: true, role: result.role, businessId: result.businessId };
});

/** Revoke an unused invite. The plaintext is gone, so this is keyed by document id. */
exports.revokeInvite = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const inviteId = request.data && request.data.inviteId;
  if (typeof inviteId !== 'string' || !inviteId) {
    throw new HttpsError('invalid-argument', 'inviteId is required.');
  }

  const ref = db().collection('invites').doc(inviteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such invite.');
  if (snap.data().used) throw new HttpsError('failed-precondition', 'That invite was already used.');

  await ref.update({ revoked: true, revokedBy: uid, revokedAt: FieldValue.serverTimestamp() });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'revoke_invite',
    targetUid: inviteId,
    details: { role: snap.data().role },
  });

  return { ok: true };
});

/**
 * Claim a business with its code.
 *
 * This was a third privilege escalation path. Business codes were
 * CHAMBER_<documentId> and every document id was readable from the public
 * businesses collection, so any business-role user could type any other
 * business's code and take ownership of it along with its visitor list.
 *
 * Now the code is unguessable, resolution happens server-side, and a business
 * that already has an owner cannot be claimed by a second account.
 */
exports.claimBusiness = onCall(callableOpts(), async (request) => {
  const auth = requireVerifiedEmail(request);
  const uid = auth.uid;
  const email = (auth.token.email || '').toLowerCase();

  await consume(`claim_${uid}`, { limit: 10, windowSeconds: 600 });

  const { codeKey } = require('./lib/codes');
  const key = codeKey(request.data && request.data.code);
  if (!key) throw new HttpsError('invalid-argument', 'Enter your business code.');

  const idxSnap = await db().collection('code_index').doc(key).get();
  if (!idxSnap.exists || idxSnap.data().active === false) {
    throw new HttpsError('not-found', 'No business found with that code.');
  }
  const businessId = idxSnap.data().businessId;

  const bizSnap = await db().collection('businesses').doc(businessId).get();
  if (!bizSnap.exists) throw new HttpsError('not-found', 'No business found with that code.');

  // One owner per business. Previously nothing stopped a second account
  // claiming a business that was already spoken for.
  const existingOwners = await db().collection('users')
    .where('businessId', '==', businessId)
    .where('role', '==', 'business')
    .limit(2)
    .get();
  const otherOwner = existingOwners.docs.find(d => d.id !== uid);
  if (otherOwner) {
    throw new HttpsError('already-exists',
      'That business has already been claimed. Contact the Chamber if this is wrong.');
  }

  await db().collection('users').doc(uid).set({
    role: 'business',
    businessId,
    roleSelected: true,
    onboardingComplete: true,
  }, { merge: true });

  const user = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, {
    ...(user.customClaims || {}), role: 'business', bid: businessId,
  });

  await writeAudit({
    actorUid: uid,
    actorEmail: email,
    actorRole: 'business',
    action: 'claim_business',
    targetUid: businessId,
    details: { businessName: bizSnap.data().name, ...fingerprint(request) },
  });

  return { ok: true, businessId, businessName: bizSnap.data().name };
});

/**
 * One-time admin bootstrap.
 *
 * Replaces the hardcoded logan@simplestepsolutions.com checks in
 * firestore.rules and App.tsx. The address lives in a function param instead,
 * and the email must be verified, so it cannot be claimed by signing up with a
 * lookalike unverified account.
 *
 * Refuses once an admin exists, so it cannot be used as a back door later.
 */
exports.bootstrapAdmin = onCall(callableOpts({ maxInstances: 2 }), async (request) => {
  const auth = requireVerifiedEmail(request);
  const email = (auth.token.email || '').toLowerCase();

  if (email !== ADMIN_EMAIL.value().toLowerCase()) {
    throw new HttpsError('permission-denied', 'Not available for this account.');
  }

  const admins = await db().collection('users').where('role', '==', 'admin').limit(2).get();
  const otherAdmin = admins.docs.find(d => d.id !== auth.uid);
  if (otherAdmin) {
    throw new HttpsError('failed-precondition', 'An admin already exists.');
  }

  await db().collection('users').doc(auth.uid).set({
    role: 'admin', roleSelected: true, onboardingComplete: true,
  }, { merge: true });

  const user = await getAuth().getUser(auth.uid);
  await getAuth().setCustomUserClaims(auth.uid, {
    ...(user.customClaims || {}), role: 'admin',
  });

  await writeAudit({
    actorUid: auth.uid,
    actorEmail: email,
    actorRole: 'admin',
    action: 'bootstrap_admin',
    targetUid: auth.uid,
    targetEmail: email,
    details: fingerprint(request),
  });

  return { ok: true };
});
