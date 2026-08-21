const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const { db, callableOpts } = require('./lib/db');
const { requireVerifiedEmail, requireRole, writeAudit } = require('./lib/guards');
const { generateBingoBoard, businessesNeededFor } = require('./lib/board');

/**
 * Boards move off users/{uid} and into boards/{uid}, written only here.
 *
 * Rules-immutable-after-create on the user document would technically work, but
 * users/{uid} has eight merge:true writers and is one forgotten field away from
 * being wrong. A separate collection nobody else writes is the version that
 * stays correct.
 *
 * The attack this closes is cheaper than GPS spoofing: a player who can rewrite
 * bingoBoard picks nine businesses in one strip mall and finishes in ten
 * minutes without leaving the parking lot.
 */

const buildBoard = async (uid, profile) => {
  const settingsSnap = await db().collection('settings').doc('global').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : { boardSize: 3, difficulty: 50 };

  const bizSnap = await db().collection('businesses').get();
  const businesses = bizSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const size = settings.boardSize || 3;
  const needed = businessesNeededFor(size);

  const cells = generateBingoBoard(businesses, settings, profile.town);

  return {
    cells,
    size,
    town: profile.town || null,
    generatedAt: FieldValue.serverTimestamp(),
    version: 1,
    // Surfaced so the client can explain a partial board instead of rendering
    // bare "TBD" tiles the player cannot ever complete.
    incomplete: cells.includes('EMPTY'),
    businessesAvailable: businesses.length,
    businessesNeeded: needed,
  };
};

/** Idempotent: creates the caller's board if they do not have one yet. */
exports.ensureBoard = onCall(callableOpts({ maxInstances: 20 }), async (request) => {
  const auth = requireVerifiedEmail(request);
  const uid = auth.uid;

  const existing = await db().collection('boards').doc(uid).get();
  if (existing.exists) {
    const d = existing.data();
    return { created: false, cells: d.cells, size: d.size, incomplete: !!d.incomplete };
  }

  const userSnap = await db().collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'Finish signing up first.');
  const profile = userSnap.data();
  if (!profile.town) throw new HttpsError('failed-precondition', 'Choose your town first.');

  // Carry a legacy board over rather than reshuffling it. A player midway
  // through the game keeps the squares they have been walking to.
  if (Array.isArray(profile.bingoBoard) && profile.bingoBoard.length) {
    const migrated = {
      cells: profile.bingoBoard,
      size: profile.boardSize || Math.sqrt(profile.bingoBoard.length),
      town: profile.town,
      generatedAt: FieldValue.serverTimestamp(),
      version: 1,
      incomplete: profile.bingoBoard.includes('EMPTY'),
      migratedFromUserDoc: true,
    };
    await db().collection('boards').doc(uid).set(migrated);
    return { created: true, cells: migrated.cells, size: migrated.size, incomplete: migrated.incomplete };
  }

  const board = await buildBoard(uid, profile);
  await db().collection('boards').doc(uid).set(board);
  return { created: true, cells: board.cells, size: board.size, incomplete: board.incomplete };
});

/**
 * Regenerate. A player may reroll their own board; chamber may reroll anyone's.
 *
 * Rerolling wipes progress, so it refuses once the player has completions
 * unless a chamber account is doing it deliberately. Previously this was a
 * client-side setDoc with no guard at all, so a player could reroll away from a
 * board they had not finished and keep their completions, which double-counted
 * businesses toward the raffle threshold.
 */
exports.regenerateBoard = onCall(callableOpts({ maxInstances: 20 }), async (request) => {
  const auth = requireVerifiedEmail(request);
  const targetUid = (request.data && request.data.uid) || auth.uid;

  let actorRole = 'player';
  if (targetUid !== auth.uid) {
    const { role } = await requireRole(request, 'chamber');
    actorRole = role;
  }

  const userSnap = await db().collection('users').doc(targetUid).get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'No such player.');
  const profile = userSnap.data();
  if (!profile.town) throw new HttpsError('failed-precondition', 'That player has no town set.');

  const completions = await db().collection('completions').where('userId', '==', targetUid).get();
  if (!completions.empty && targetUid === auth.uid) {
    throw new HttpsError('failed-precondition',
      'You have already verified visits on this board, so it cannot be rerolled. Ask the Chamber if you need a new one.');
  }

  const board = await buildBoard(targetUid, profile);
  await db().collection('boards').doc(targetUid).set(board);

  if (targetUid !== auth.uid) {
    await writeAudit({
      actorUid: auth.uid,
      actorEmail: auth.token.email || '',
      actorRole,
      action: 'regenerate_board',
      targetUid,
      targetEmail: profile.email || '',
      details: { size: board.size, completionsAtReroll: completions.size },
    });
  }

  return { cells: board.cells, size: board.size, incomplete: board.incomplete };
});
