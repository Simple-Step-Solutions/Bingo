const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

// initializeApp() must run before anything calls getFirestore, so lib/db is
// required after it rather than at the top of the file.
const { databaseId, db: firestore } = require('./lib/db');

const TYPE_TITLES = {
  info: 'Chamber Bingo',
  win: 'We have a winner!',
  raffle: 'Raffle Update',
  game: 'Game Update',
};

exports.sendPushOnNotification = onDocumentCreated({
  document: 'notifications/{notificationId}',
  database: databaseId,
  region: 'us-east1',
}, async (event) => {
  const notification = event.data.data();
  if (!notification) return;

  const db = firestore();
  const messaging = getMessaging();

  const title = TYPE_TITLES[notification.type] || 'Chamber Bingo';
  const body = notification.message;

  let usersSnap;
  if (notification.userId === 'all') {
    usersSnap = await db.collection('users').where('fcmTokens', '!=', null).get();
  } else {
    usersSnap = await db.collection('users').where('__name__', '==', notification.userId).get();
  }

  const tokens = [];
  usersSnap.forEach(doc => {
    const { fcmTokens } = doc.data();
    if (Array.isArray(fcmTokens)) tokens.push(...fcmTokens);
  });

  if (tokens.length === 0) return;

  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  await Promise.all(
    chunks.map(chunk =>
      messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: {
          notification: { icon: 'https://bingo.simplestepsolutions.com/icons/icon-192.png' },
          fcmOptions: { link: 'https://bingo.simplestepsolutions.com/' },
        },
      }).then(response => {
        const toRemove = [];
        response.responses.forEach((resp, i) => {
          if (!resp.success && (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          )) {
            toRemove.push(chunk[i]);
          }
        });
        if (toRemove.length === 0) return;
        const batch = db.batch();
        usersSnap.forEach(userDoc => {
          const { fcmTokens } = userDoc.data();
          if (!Array.isArray(fcmTokens)) return;
          const cleaned = fcmTokens.filter(t => !toRemove.includes(t));
          if (cleaned.length !== fcmTokens.length) {
            batch.update(userDoc.ref, { fcmTokens: cleaned });
          }
        });
        return batch.commit();
      })
    )
  );
});

// =====================================================================
// Role claims (Phase 2a)
//
// users/{uid}.role stays the human-editable source of truth. This trigger
// projects it into a custom claim so security rules can read the role from
// the token instead of chasing get() calls through the users collection.
//
// Nothing reads these claims yet. This deploys with no visible effect, which
// is the point: it runs long enough to confirm claims are landing before any
// rule depends on them.
//
// Two properties worth keeping:
//
//   * 'player' is represented by the ABSENCE of a role claim. Rules default an
//     absent claim to player, so the overwhelming majority of accounts never
//     carry a claim and existing players need no backfill at all.
//
//   * It fails closed. Anything unrecognized, missing, or deleted resolves to
//     player rather than to whatever the document happened to say.
//
// Known trade-off, documented so nobody "fixes" it later: a demotion takes up
// to an hour to reach security rules, because rules cannot check token
// revocation. Operations where that hour actually matters belong in callables,
// which can check tokensValidAfterTime directly.
// =====================================================================

const ROLES = ['player', 'business', 'chamber', 'admin'];

exports.syncRoleClaims = onDocumentWritten({
  document: 'users/{uid}',
  database: databaseId,
  region: 'us-east1',
  maxInstances: 10,
}, async (event) => {
  const uid = event.params.uid;

  const beforeSnap = event.data && event.data.before;
  const afterSnap = event.data && event.data.after;
  const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
  const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

  // This fires on every write to a user document, and LocationTracker updates
  // currentLocation continuously while the app is open. Bail out before
  // touching the Auth API unless something claim-relevant actually moved.
  if (before && after
      && before.role === after.role
      && before.businessId === after.businessId) {
    return;
  }

  const role = after && ROLES.includes(after.role) ? after.role : 'player';
  const businessId = role === 'business'
    && typeof (after && after.businessId) === 'string'
    && after.businessId
    ? after.businessId
    : null;

  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (err) {
    // Seed data and test fixtures create user documents with no matching Auth
    // account. There is nothing to sync and nothing has gone wrong.
    if (err.code === 'auth/user-not-found') return;
    throw err;
  }

  const existing = user.customClaims || {};
  const desiredRole = role === 'player' ? undefined : role;
  const desiredBid = businessId || undefined;

  if (existing.role === desiredRole && existing.bid === desiredBid) return;

  // Preserve anything else already on the token. setCustomUserClaims replaces
  // the whole object, so a naive { role } would silently drop other claims.
  const next = { ...existing };
  if (desiredRole === undefined) delete next.role; else next.role = desiredRole;
  if (desiredBid === undefined) delete next.bid; else next.bid = desiredBid;

  await getAuth().setCustomUserClaims(uid, next);

  logger.info('syncRoleClaims', {
    uid,
    role: desiredRole || 'player',
    bid: desiredBid || null,
    previousRole: existing.role || 'player',
  });
});

// =====================================================================
// Callables (Phase 2b-2d)
//
// Re-exported here because firebase.json points at index.js. Each module keeps
// its own concern: visits.js is the game loop, boards.js owns board generation,
// businessCodes.js owns the code/secret/index split.
//
// Every one of them gets its Firestore handle from lib/db, which pins the named
// database. A callable that calls getFirestore() directly reads an empty
// (default) database and returns cheerful, wrong answers.
// =====================================================================

const visits = require('./visits');
const boards = require('./boards');
const businessCodes = require('./businessCodes');

exports.verifyVisit = visits.verifyVisit;
exports.adminGrantCompletion = visits.adminGrantCompletion;

exports.ensureBoard = boards.ensureBoard;
exports.regenerateBoard = boards.regenerateBoard;

exports.provisionBusinessCode = businessCodes.provisionBusinessCode;
exports.rotateAllCodes = businessCodes.rotateAllCodes;
exports.setBusinessNfc = businessCodes.setBusinessNfc;
