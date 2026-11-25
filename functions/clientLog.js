const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { callableOpts } = require('./lib/db');
const { consume } = require('./lib/ratelimit');
const { fingerprint } = require('./lib/guards');
const { sanitizeReport } = require('./lib/clientReport');

/**
 * The app reports problems that only its own browser can see: Google sign-in
 * failing, the install button falling back to instructions, a callable being
 * refused. Before this existed those vanished entirely, and "people can't log
 * in with Google" had no evidence behind it at all.
 *
 * Open to people who are not signed in, because sign-in failures happen before
 * there is anyone to sign in as. Rate limited per IP and allow-listed field by
 * field in clientReport.js. Writes to Cloud Logging only, nothing to Firestore.
 *
 * Find them in Logs Explorer with:
 *   jsonPayload.message="client_issue"
 * and a specific screenshot's reference with:
 *   jsonPayload.ref="K7Q2MX"
 */
exports.logClientIssue = onCall(callableOpts({ maxInstances: 5 }), async (request) => {
  const fp = fingerprint(request);
  try {
    await consume(`clientlog_${fp.ip || 'unknown'}`, { limit: 30, windowSeconds: 600 });
  } catch {
    return { ok: false };
  }

  const report = sanitizeReport(request.data);
  if (!report) return { ok: false };

  logger.warn('client_issue', {
    ...report,
    uid: (request.auth && request.auth.uid) || null,
    userAgent: fp.userAgent ? String(fp.userAgent).slice(0, 300) : null,
  });
  return { ok: true };
});
