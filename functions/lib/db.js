const { defineString } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');

/**
 * The app runs on a NAMED Firestore database, not (default).
 *
 * getFirestore() with no argument reads and writes an empty (default) database
 * with no error and no log line, so a function that forgets this appears to
 * work perfectly while touching nothing. Every Firestore handle in this
 * codebase must come from db() below.
 */
const databaseId = defineString('FIRESTORE_DATABASE_ID', { default: '(default)' });

const db = () => getFirestore(databaseId.value());

/** Shared defaults for every function in this codebase. */
const REGION = 'us-east1';

/**
 * App Check starts disabled everywhere. Phase 7 turns it on per function, in
 * monitoring mode first -- the PWA caches its own JavaScript, so a user who has
 * not reopened the app in a while is still running a bundle with no App Check
 * SDK in it. Flipping this to true before that curve flattens locks out real
 * players.
 */
const ENFORCE_APP_CHECK = false;

const callableOpts = (extra = {}) => ({
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  maxInstances: 10,
  ...extra,
});

module.exports = { databaseId, db, REGION, ENFORCE_APP_CHECK, callableOpts };
