const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

const { db, callableOpts } = require('./lib/db');
const { codeKey } = require('./lib/codes');
const { distanceMeters, validCoords } = require('./lib/geo');
const { requireVerifiedEmail, requireRole, writeAudit, fingerprint } = require('./lib/guards');
const { consume } = require('./lib/ratelimit');
const { checkBingo } = require('./lib/board');

const GEOFENCE_M = 500;

/**
 * Read the caller's board, tolerating both shapes during the rollout.
 *
 * boards/{uid} is authoritative once ensureBoard has run. users/{uid}.bingoBoard
 * is the legacy location and stays readable until every client has been on the
 * new bundle for a release, because the PWA caches its own JavaScript and a
 * player who has not reopened the app is still running the old one.
 */
const loadBoard = async (uid) => {
  const boardSnap = await db().collection('boards').doc(uid).get();
  if (boardSnap.exists) {
    const d = boardSnap.data();
    if (Array.isArray(d.cells) && d.cells.length) {
      return { cells: d.cells, size: d.size || Math.sqrt(d.cells.length) };
    }
  }
  const userSnap = await db().collection('users').doc(uid).get();
  const u = userSnap.exists ? userSnap.data() : null;
  if (u && Array.isArray(u.bingoBoard) && u.bingoBoard.length) {
    return { cells: u.bingoBoard, size: u.boardSize || Math.sqrt(u.bingoBoard.length) };
  }
  return null;
};

/** Failed attempts are cheap and are the raw material for the review panel. */
const recordAttempt = async (payload) => {
  try {
    await db().collection('verification_attempts').add({
      ...payload,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Never let audit bookkeeping fail the user's actual request.
    logger.warn('recordAttempt failed', { error: err.message });
  }
};

/**
 * Server-authoritative visit verification.
 *
 * Everything that used to be a client-side `if` in Dashboard.tsx happens here:
 * code resolution, the duplicate check, the geofence, and the game-paused
 * switch. Previously a player could skip all four by calling addDoc directly,
 * because the rules only checked that userId matched the caller.
 *
 * Be honest about what the geofence proves: passing coordinates in a call is no
 * more cryptographically sound than checking them in the browser. Both trust a
 * number the client chose. What genuinely changed is that the check can no
 * longer be SKIPPED, and every attempt is now recorded with enough context for
 * a human to adjudicate a disputed prize.
 */
exports.verifyVisit = onCall(callableOpts({ maxInstances: 40 }), async (request) => {
  const auth = requireVerifiedEmail(request);
  const uid = auth.uid;

  await consume(`verify_${uid}`, { limit: 30, windowSeconds: 300 });

  const { code, method, lat, lng } = request.data || {};
  const fp = fingerprint(request);

  const key = codeKey(code);
  if (!key) throw new HttpsError('invalid-argument', 'Enter or scan a code.');

  const idxSnap = await db().collection('code_index').doc(key).get();
  if (!idxSnap.exists || idxSnap.data().active === false) {
    await recordAttempt({ uid, outcome: 'invalid_code', method: method || 'unknown', ...fp });
    throw new HttpsError('not-found', 'That code is not valid.');
  }

  const businessId = idxSnap.data().businessId;
  const bizSnap = await db().collection('businesses').doc(businessId).get();
  if (!bizSnap.exists) {
    throw new HttpsError('not-found', 'That business is no longer in the game.');
  }
  const biz = bizSnap.data();

  const settingsSnap = await db().collection('settings').doc('global').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  if (settings.gamePaused === true) {
    throw new HttpsError('failed-precondition', 'The game is paused by the Chamber right now.');
  }

  const board = await loadBoard(uid);
  if (!board) {
    throw new HttpsError('failed-precondition', 'Generate your board before verifying a visit.');
  }
  if (!board.cells.includes(businessId)) {
    await recordAttempt({ uid, businessId, outcome: 'not_on_board', method: method || 'unknown', ...fp });
    throw new HttpsError('failed-precondition', `${biz.name} is not on your board.`);
  }

  let distanceM = null;
  if (validCoords(biz.lat, biz.lng)) {
    if (!validCoords(lat, lng)) {
      throw new HttpsError('failed-precondition',
        'Location required. Turn on GPS, wait a moment, then try again.');
    }
    distanceM = Math.round(distanceMeters(lat, lng, biz.lat, biz.lng));
    if (distanceM > GEOFENCE_M) {
      await recordAttempt({
        uid, businessId, outcome: 'out_of_range', distanceM,
        reportedLat: lat, reportedLng: lng, method: method || 'unknown', ...fp,
      });
      throw new HttpsError('failed-precondition',
        `You need to be at ${biz.name} to verify. You are ${distanceM}m away.`);
    }
  }

  const userSnap = await db().collection('users').doc(uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};

  // Deterministic ID. This is what makes double-completion structurally
  // impossible: there is no read-then-write window to race, and create() on an
  // existing document fails atomically.
  const completionRef = db().collection('completions').doc(`${uid}_${businessId}`);
  try {
    await completionRef.create({
      userId: uid,
      businessId,
      town: biz.town || null,
      userName: profile.displayName || '',
      timestamp: FieldValue.serverTimestamp(),
      timestampIso: new Date().toISOString(),
      method: method || 'unknown',
      distanceM,
      reportedLat: validCoords(lat, lng) ? lat : null,
      reportedLng: validCoords(lat, lng) ? lng : null,
      ...fp,
    });
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(err.message || '')) {
      throw new HttpsError('already-exists', `You already completed ${biz.name}.`);
    }
    throw err;
  }

  // Win detection, server-side, recorded. The old flow told the player to show
  // their screen to a chamber official, which is forgeable and left no record.
  const completionsSnap = await db().collection('completions').where('userId', '==', uid).get();
  const completedIds = completionsSnap.docs.map(d => d.data().businessId);
  const hasBingo = checkBingo(board.cells, completedIds, board.size);

  if (hasBingo) {
    const winRef = db().collection('wins').doc(uid);
    try {
      await winRef.create({
        userId: uid,
        userName: profile.displayName || '',
        userEmail: profile.email || '',
        completionsCount: completedIds.length,
        prize: settings.bingoPrize || null,
        redeemed: false,
        timestamp: FieldValue.serverTimestamp(),
        timestampIso: new Date().toISOString(),
      });
      logger.info('bingo', { uid, completions: completedIds.length });
    } catch (err) {
      // Already recorded on an earlier completion. Not an error.
      if (!(err.code === 6 || /already exists/i.test(err.message || ''))) throw err;
    }
  }

  return {
    ok: true,
    businessId,
    businessName: biz.name,
    distanceM,
    bingo: hasBingo,
    completionsCount: completedIds.length,
  };
});

/**
 * Chamber override for a visit that genuinely happened but would not verify:
 * a dead phone, no signal in a basement shop, a code that would not scan.
 *
 * This exists as a callable rather than a direct write so the override is
 * validated and, more importantly, attributed. The situation where that matters
 * is precisely the one where a prize gets disputed.
 */
exports.adminGrantCompletion = onCall(callableOpts(), async (request) => {
  const { uid: actorUid, role, profile } = await requireRole(request, 'chamber');
  const { userId, businessId, reason } = request.data || {};

  if (typeof userId !== 'string' || !userId || typeof businessId !== 'string' || !businessId) {
    throw new HttpsError('invalid-argument', 'userId and businessId are required.');
  }
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Give a reason for the override.');
  }

  const bizSnap = await db().collection('businesses').doc(businessId).get();
  if (!bizSnap.exists) throw new HttpsError('not-found', 'No such business.');

  const targetSnap = await db().collection('users').doc(userId).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'No such player.');

  const ref = db().collection('completions').doc(`${userId}_${businessId}`);
  try {
    await ref.create({
      userId,
      businessId,
      town: bizSnap.data().town || null,
      userName: targetSnap.data().displayName || '',
      timestamp: FieldValue.serverTimestamp(),
      timestampIso: new Date().toISOString(),
      method: 'chamber_override',
      grantedBy: actorUid,
      grantReason: reason.trim(),
      distanceM: null,
      ...fingerprint(request),
    });
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(err.message || '')) {
      throw new HttpsError('already-exists', 'That visit is already recorded.');
    }
    throw err;
  }

  await writeAudit({
    actorUid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'grant_completion',
    targetUid: userId,
    targetEmail: targetSnap.data().email || '',
    details: { businessId, businessName: bizSnap.data().name, reason: reason.trim() },
  });

  return { ok: true };
});
