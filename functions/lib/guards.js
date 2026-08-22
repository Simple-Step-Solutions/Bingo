const { HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('./db');

/**
 * Caller helpers shared by every callable.
 *
 * Callables read the role from the custom claim that syncRoleClaims maintains,
 * with one important difference from security rules: a callable can check
 * tokensValidAfterTime, so it does NOT inherit the up-to-an-hour demotion lag
 * that rules do. Anything genuinely dangerous belongs here for that reason.
 */

const requireAuth = (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  return auth;
};

/**
 * Unverified accounts hold perfectly valid tokens. Anywhere a role or an
 * identity actually matters, the email has to be verified first, otherwise
 * someone signs up as anybody@chamber.org and redeems an emailHint invite.
 */
const requireVerifiedEmail = (request) => {
  const auth = requireAuth(request);
  // Google sign-in always yields a verified email; email/password does not.
  if (auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email address first.');
  }
  return auth;
};

const roleOf = (auth) => {
  const claim = auth.token && auth.token.role;
  return typeof claim === 'string' ? claim : 'player';
};

const RANK = { player: 0, business: 1, chamber: 2, admin: 3 };

/**
 * Confirm the caller still holds the role their token claims.
 *
 * Rules cannot do this. A callable can, so a revoked or demoted account loses
 * privileged access here immediately rather than whenever their token happens
 * to refresh.
 */
const requireRole = async (request, minimum) => {
  const auth = requireVerifiedEmail(request);
  const role = roleOf(auth);

  if ((RANK[role] ?? -1) < RANK[minimum]) {
    throw new HttpsError('permission-denied', 'You do not have access to this.');
  }

  // Claims are projected from the user document; re-read it so a demotion made
  // seconds ago is honoured now rather than in an hour.
  const snap = await db().collection('users').doc(auth.uid).get();
  const liveRole = snap.exists ? (snap.data().role || 'player') : 'player';
  if ((RANK[liveRole] ?? -1) < RANK[minimum]) {
    throw new HttpsError('permission-denied', 'You do not have access to this.');
  }

  const user = await getAuth().getUser(auth.uid);
  if (user.tokensValidAfterTime) {
    const issuedAtMs = (auth.token.auth_time || 0) * 1000;
    if (issuedAtMs && issuedAtMs < Date.parse(user.tokensValidAfterTime)) {
      throw new HttpsError('unauthenticated', 'Session expired. Sign in again.');
    }
  }

  return { auth, uid: auth.uid, role: liveRole, profile: snap.exists ? snap.data() : null };
};

/**
 * Audit entries are written with the Admin SDK so they cannot be forged, and
 * with a server timestamp so the ordering cannot be gamed.
 */
const writeAudit = async (entry) => {
  // Collection is 'audit_log', singular. Admin.tsx and auditService.ts both
  // read that name; a plural here writes to a collection nothing displays.
  await db().collection('audit_log').add({
    ...entry,
    timestamp: FieldValue.serverTimestamp(),
    // Kept alongside the server timestamp because the existing AuditLogViewer
    // renders an ISO string. Remove once that component reads the Timestamp.
    timestampIso: new Date().toISOString(),
  });
};

/** Request fingerprint recorded on completions and sensitive actions. */
const fingerprint = (request) => ({
  ip: (request.rawRequest && (request.rawRequest.ip
    || request.rawRequest.headers['x-forwarded-for'])) || null,
  userAgent: (request.rawRequest && request.rawRequest.headers['user-agent']) || null,
  appCheck: request.app ? 'verified' : 'absent',
});

module.exports = {
  requireAuth, requireVerifiedEmail, requireRole, roleOf, RANK,
  writeAudit, fingerprint,
};
