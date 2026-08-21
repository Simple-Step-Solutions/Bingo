const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('./db');

/**
 * Firestore token bucket.
 *
 * Deliberately simple. This is not defence against a determined attacker with a
 * botnet, it is a cap on how fast one identity can brute-force a code or farm
 * the invite-validity oracle. rate_limits is locked to `if false` in the rules,
 * so only the Admin SDK can touch it.
 *
 * Set a TTL policy on rate_limits.expiresAt in the console so old buckets are
 * reaped instead of accumulating one document per user per action forever.
 */
const consume = async (key, { limit, windowSeconds }) => {
  const ref = db().collection('rate_limits').doc(key.replace(/\//g, '_'));
  const now = Date.now();

  const allowed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = data && data.windowStart ? data.windowStart : 0;
    const count = data && typeof data.count === 'number' ? data.count : 0;

    if (now - windowStart > windowSeconds * 1000) {
      tx.set(ref, {
        windowStart: now,
        count: 1,
        expiresAt: new Date(now + windowSeconds * 2000),
      });
      return true;
    }

    if (count >= limit) return false;

    tx.set(ref, {
      windowStart,
      count: FieldValue.increment(1),
      expiresAt: new Date(windowStart + windowSeconds * 2000),
    }, { merge: true });
    return true;
  });

  if (!allowed) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
  }
};

module.exports = { consume };
