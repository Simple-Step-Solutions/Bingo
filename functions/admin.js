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
  const { winId, userId, notes } = request.data || {};

  // Win ids are event-scoped (`{eventId}_{uid}`), so the bare uid this used to
  // take only ever resolved a legacy win. Every event-scoped bingo returned
  // not-found, which made the whole redemption half unreachable. Callers pass
  // the document id; userId stays accepted for legacy wins keyed by uid alone.
  const docId = typeof winId === 'string' && winId ? winId : userId;
  if (typeof docId !== 'string' || !docId) {
    throw new HttpsError('invalid-argument', 'winId is required.');
  }

  const ref = db().collection('wins').doc(docId);
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
    targetUid: snap.data().userId || docId,
    targetEmail: snap.data().userEmail || '',
    details: { prize: snap.data().prize || null, winId: docId },
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

/**
 * Reset one player.
 *
 * This had to become a callable: the board moved to boards/{uid}, which no
 * client can write, so the old client-side reset silently stopped clearing the
 * board while appearing to succeed. It also deletes completions in a batch
 * rather than one delete per document from the browser.
 */
exports.adminResetUser = onCall(callableOpts({ timeoutSeconds: 120 }), async (request) => {
  const { uid: actorUid, role, profile } = await requireRole(request, 'chamber');
  const { userId, type } = request.data || {};

  if (typeof userId !== 'string' || !userId) {
    throw new HttpsError('invalid-argument', 'userId is required.');
  }
  if (!['town', 'progress', 'board', 'everything'].includes(type)) {
    throw new HttpsError('invalid-argument', 'Not a valid reset type.');
  }

  const targetRef = db().collection('users').doc(userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'No such player.');

  let deletedCompletions = 0;

  if (type === 'progress' || type === 'everything') {
    const snap = await db().collection('completions').where('userId', '==', userId).get();
    deletedCompletions = snap.size;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db().batch();
      snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    // A win recorded against progress that no longer exists is misleading in
    // the chamber's redemption view.
    await db().collection('wins').doc(userId).delete().catch(() => {});
  }

  if (['board', 'everything', 'town'].includes(type)) {
    await db().collection('boards').doc(userId).delete().catch(() => {});
    await targetRef.set({ bingoBoard: FieldValue.delete(), boardSize: FieldValue.delete() }, { merge: true });
  }

  if (type === 'town' || type === 'everything') {
    await targetRef.set({ town: '', onboardingComplete: false }, { merge: true });
  }

  await writeAudit({
    actorUid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: `reset_${type}`,
    targetUid: userId,
    targetEmail: targetSnap.data().email || '',
    details: { resetType: type, deletedCompletions },
  });

  return { ok: true, deletedCompletions };
});

/**
 * Reset every player's town, board and progress. Used between events until
 * Phase 4 replaces it with archiving an event and opening the next one.
 */
exports.adminGlobalReset = onCall(callableOpts({ timeoutSeconds: 540 }), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'admin');

  const usersSnap = await db().collection('users').get();
  const completionsSnap = await db().collection('completions').get();
  const boardsSnap = await db().collection('boards').get();
  const winsSnap = await db().collection('wins').get();
  // Rejected-attempt records belong to the event that produced them, and no
  // client can delete them, so they have to be cleared here or never.
  const attemptsSnap = await db().collection('verification_attempts').get();

  const deleteAll = async (docs) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db().batch();
      docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  };

  await deleteAll(completionsSnap.docs);
  await deleteAll(boardsSnap.docs);
  await deleteAll(winsSnap.docs);
  await deleteAll(attemptsSnap.docs);

  for (let i = 0; i < usersSnap.docs.length; i += 400) {
    const batch = db().batch();
    usersSnap.docs.slice(i, i + 400).forEach(d => {
      batch.set(d.ref, {
        town: '',
        onboardingComplete: false,
        bingoBoard: FieldValue.delete(),
        boardSize: FieldValue.delete(),
      }, { merge: true });
    });
    await batch.commit();
  }

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'global_reset',
    targetUid: 'ALL',
    details: {
      users: usersSnap.size,
      completions: completionsSnap.size,
      boards: boardsSnap.size,
      wins: winsSnap.size,
      attempts: attemptsSnap.size,
    },
  });

  return {
    ok: true,
    users: usersSnap.size,
    completions: completionsSnap.size,
    boards: boardsSnap.size,
  };
});
