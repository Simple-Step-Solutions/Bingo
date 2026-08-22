const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const { db, callableOpts } = require('./lib/db');
const { requireRole, writeAudit, fingerprint } = require('./lib/guards');
const { randomInt } = require('./lib/board');

const ROLES = ['player', 'business', 'chamber', 'admin'];

/**
 * Change someone's role.
 *
 * Admin only, and a callable rather than a direct write for two reasons: the
 * rules now refuse role changes from every client, and the custom claim has to
 * move in the same operation or the token and the document disagree.
 *
 * Chamber accounts deliberately cannot do this. A chamber account that can
 * promote people is a root of trust for the whole system.
 */
exports.setUserRole = onCall(callableOpts(), async (request) => {
  const { uid: actorUid, role: actorRole, profile } = await requireRole(request, 'admin');
  const { uid, role, businessId } = request.data || {};

  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Not a valid role.');
  if (role === 'business' && (typeof businessId !== 'string' || !businessId)) {
    throw new HttpsError('invalid-argument', 'A business account needs a business.');
  }

  const targetRef = db().collection('users').doc(uid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'No such user.');
  const previous = targetSnap.data().role || 'player';

  // Refuse to remove the last admin. Locking everyone out of the admin panel is
  // recoverable only from the console, and only by someone who knows that.
  if (previous === 'admin' && role !== 'admin') {
    const admins = await db().collection('users').where('role', '==', 'admin').limit(2).get();
    if (admins.size <= 1) {
      throw new HttpsError('failed-precondition', 'That is the only admin account.');
    }
  }

  await targetRef.set({
    role,
    ...(role === 'business' ? { businessId } : {}),
    ...(previous === 'business' && role !== 'business' ? { businessId: FieldValue.delete() } : {}),
    roleSelected: true,
  }, { merge: true });

  const user = await getAuth().getUser(uid);
  const next = { ...(user.customClaims || {}) };
  if (role === 'player') delete next.role; else next.role = role;
  if (role === 'business') next.bid = businessId; else delete next.bid;
  await getAuth().setCustomUserClaims(uid, next);

  // A demotion should take effect now, not whenever the token happens to
  // refresh. Rules cannot check this, but every callable does.
  if (ROLES.indexOf(role) < ROLES.indexOf(previous)) {
    await getAuth().revokeRefreshTokens(uid);
  }

  await writeAudit({
    actorUid,
    actorEmail: (profile && profile.email) || '',
    actorRole,
    action: 'set_user_role',
    targetUid: uid,
    targetEmail: targetSnap.data().email || '',
    details: { from: previous, to: role, businessId: businessId || null, ...fingerprint(request) },
  });

  return { ok: true, from: previous, to: role };
});

/**
 * Draw a raffle winner.
 *
 * This previously ran in ChamberManager.tsx as
 * `entries.sort(() => 0.5 - Math.random())[0]`, which is a provably biased
 * shuffle deciding who wins a real prize. It now runs server-side with a CSPRNG
 * and writes an audit entry recording the entry pool, so the draw can be shown
 * to have been fair.
 */
exports.drawRaffleWinner = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');

  const entriesSnap = await db().collection('raffle_entries').get();
  if (entriesSnap.empty) throw new HttpsError('failed-precondition', 'There are no raffle entries.');

  const previousWinners = await db().collection('winners').get();
  const alreadyWon = new Set(previousWinners.docs.map(d => d.data().userId));

  const eligible = entriesSnap.docs.filter(d => !alreadyWon.has(d.data().userId));
  if (eligible.length === 0) {
    throw new HttpsError('failed-precondition', 'Everyone in the pool has already won.');
  }

  const picked = eligible[randomInt(eligible.length)];
  const entry = picked.data();

  const settingsSnap = await db().collection('settings').doc('global').get();
  const prize = settingsSnap.exists ? (settingsSnap.data().rafflePrize || null) : null;

  const winnerRef = await db().collection('winners').add({
    userId: entry.userId,
    userName: entry.userName || '',
    userEmail: entry.userEmail || '',
    prize,
    drawnBy: uid,
    poolSize: eligible.length,
    totalEntries: entriesSnap.size,
    timestamp: FieldValue.serverTimestamp(),
    timestampIso: new Date().toISOString(),
  });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'draw_raffle_winner',
    targetUid: entry.userId,
    targetEmail: entry.userEmail || '',
    details: { winnerId: winnerRef.id, poolSize: eligible.length, totalEntries: entriesSnap.size, prize },
  });

  return {
    ok: true,
    winner: { userId: entry.userId, userName: entry.userName || '', userEmail: entry.userEmail || '' },
    poolSize: eligible.length,
  };
});

/**
 * Mark a bingo win as redeemed when the prize is handed over.
 *
 * Wins are recorded by verifyVisit; this is the other half, so the chamber has
 * a list of who has actually collected. Previously neither half existed.
 */
exports.redeemWin = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const { userId, notes } = request.data || {};
  if (typeof userId !== 'string' || !userId) {
    throw new HttpsError('invalid-argument', 'userId is required.');
  }

  const ref = db().collection('wins').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That player has no recorded bingo.');
  if (snap.data().redeemed) throw new HttpsError('failed-precondition', 'Already redeemed.');

  await ref.update({
    redeemed: true,
    redeemedBy: uid,
    redeemedAt: FieldValue.serverTimestamp(),
    redeemNotes: typeof notes === 'string' ? notes.slice(0, 500) : null,
  });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'redeem_win',
    targetUid: userId,
    targetEmail: snap.data().userEmail || '',
    details: { prize: snap.data().prize || null },
  });

  return { ok: true };
});

/**
 * Cheating review panel data.
 *
 * No browser scheme can prove physical presence, so the posture for a chamber
 * event with a modest prize is unguessable codes plus visibility, not
 * unbeatable attestation. This returns the signals a human can adjudicate.
 *
 * Impossible travel is the strongest of them: a player whose consecutive
 * completions imply sustained speeds above roughly 120 km/h either drove
 * dangerously or spoofed their GPS.
 */
exports.reviewSuspiciousActivity = onCall(callableOpts({ timeoutSeconds: 120 }), async (request) => {
  await requireRole(request, 'chamber');

  const IMPOSSIBLE_KMH = 120;

  const snap = await db().collection('completions').get();
  const byUser = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId).push(d);
  }

  const { distanceMeters } = require('./lib/geo');
  const flags = [];

  for (const [userId, rows] of byUser) {
    const timed = rows
      .filter(r => r.timestampIso && typeof r.reportedLat === 'number' && typeof r.reportedLng === 'number')
      .sort((a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso));

    for (let i = 1; i < timed.length; i++) {
      const prev = timed[i - 1];
      const cur = timed[i];
      const seconds = (Date.parse(cur.timestampIso) - Date.parse(prev.timestampIso)) / 1000;
      if (seconds <= 0) continue;
      const metres = distanceMeters(prev.reportedLat, prev.reportedLng, cur.reportedLat, cur.reportedLng);
      const kmh = (metres / 1000) / (seconds / 3600);
      if (kmh > IMPOSSIBLE_KMH) {
        flags.push({
          type: 'impossible_travel', userId, kmh: Math.round(kmh),
          from: prev.businessId, to: cur.businessId, seconds: Math.round(seconds),
        });
      }
    }

    // Completions clustered into a very short window.
    const times = rows.filter(r => r.timestampIso).map(r => Date.parse(r.timestampIso)).sort();
    for (let i = 4; i < times.length; i++) {
      const windowMinutes = (times[i] - times[i - 4]) / 60000;
      if (windowMinutes < 10) {
        flags.push({ type: 'burst', userId, count: 5, windowMinutes: Math.round(windowMinutes) });
        break;
      }
    }

    // Verified without App Check, or right at the geofence boundary.
    const noAppCheck = rows.filter(r => r.appCheck === 'absent').length;
    if (noAppCheck > 0 && noAppCheck === rows.length && rows.length >= 3) {
      flags.push({ type: 'no_app_check', userId, count: noAppCheck });
    }
    const nearBoundary = rows.filter(r => typeof r.distanceM === 'number' && r.distanceM > 450).length;
    if (nearBoundary >= 3) {
      flags.push({ type: 'near_geofence_boundary', userId, count: nearBoundary });
    }
  }

  // One IP across several accounts.
  const ipUsers = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.ip) continue;
    if (!ipUsers.has(d.ip)) ipUsers.set(d.ip, new Set());
    ipUsers.get(d.ip).add(d.userId);
  }
  for (const [ip, users] of ipUsers) {
    if (users.size >= 4) {
      flags.push({ type: 'shared_ip', ip, userCount: users.size, userIds: [...users].slice(0, 10) });
    }
  }

  return { flags, completionsReviewed: snap.size, playersReviewed: byUser.size };
});
