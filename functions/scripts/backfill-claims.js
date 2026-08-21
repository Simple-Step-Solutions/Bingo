/**
 * One-off backfill for the role custom claims that syncRoleClaims maintains.
 *
 * syncRoleClaims only fires when a user document is written, so accounts that
 * were promoted before it was deployed have no claim. Players do not need one
 * (rules default an absent claim to 'player'), so in practice this only has to
 * touch chamber, business, and admin accounts, plus anyone carrying a stale
 * claim their document no longer justifies.
 *
 * Run it once after deploying syncRoleClaims, and again after any bulk role
 * edit made directly in the console.
 *
 * Usage
 * -----
 *   # Authenticate as a principal with Firebase Auth admin access:
 *   gcloud auth application-default login
 *
 *   # Report what would change, without writing anything:
 *   FIRESTORE_DATABASE_ID=ai-studio-b22a3d46-2072-4ec8-b7cc-b2370d5fdd10 \
 *   GOOGLE_CLOUD_PROJECT=sss-hvgcc-bingo \
 *     node functions/scripts/backfill-claims.js
 *
 *   # Apply:
 *   ... node functions/scripts/backfill-claims.js --apply
 *
 * A service account key works too, via GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Claims do not reach a signed-in user's token until it refreshes, which takes
 * up to an hour. Nothing in the rules depends on these claims yet, so that lag
 * is harmless here; it matters when the dual-trust rules ship.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const ROLES = ['player', 'business', 'chamber', 'admin'];

const apply = process.argv.includes('--apply');
const databaseId = process.env.FIRESTORE_DATABASE_ID;
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

if (!databaseId) {
  console.error('FIRESTORE_DATABASE_ID is required.');
  console.error('The app runs on a named database; without this the script');
  console.error('reads an empty (default) database and reports zero users.');
  process.exit(1);
}
if (!projectId) {
  console.error('GOOGLE_CLOUD_PROJECT is required (e.g. sss-hvgcc-bingo).');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });

const db = getFirestore(databaseId);
const auth = getAuth();

async function main() {
  console.log(`project  ${projectId}`);
  console.log(`database ${databaseId}`);
  console.log(apply ? 'mode     APPLY\n' : 'mode     dry run (pass --apply to write)\n');

  const snap = await db.collection('users').get();
  if (snap.empty) {
    console.error('No user documents found. Check FIRESTORE_DATABASE_ID.');
    process.exit(1);
  }

  let changed = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const data = doc.data();

    const role = ROLES.includes(data.role) ? data.role : 'player';
    const businessId = role === 'business' && typeof data.businessId === 'string' && data.businessId
      ? data.businessId
      : null;

    const desiredRole = role === 'player' ? undefined : role;
    const desiredBid = businessId || undefined;

    let user;
    try {
      user = await auth.getUser(uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        missing += 1;
        console.log(`  skip  ${uid}  no Auth account (orphaned document)`);
        continue;
      }
      failed += 1;
      console.error(`  FAIL  ${uid}  ${err.message}`);
      continue;
    }

    const existing = user.customClaims || {};
    if (existing.role === desiredRole && existing.bid === desiredBid) {
      skipped += 1;
      continue;
    }

    const next = { ...existing };
    if (desiredRole === undefined) delete next.role; else next.role = desiredRole;
    if (desiredBid === undefined) delete next.bid; else next.bid = desiredBid;

    const from = existing.role || 'player';
    const to = desiredRole || 'player';
    const bid = desiredBid ? ` bid=${desiredBid}` : '';
    console.log(`  ${apply ? 'set ' : 'would'}  ${user.email || uid}  ${from} -> ${to}${bid}`);

    if (apply) {
      try {
        await auth.setCustomUserClaims(uid, next);
      } catch (err) {
        failed += 1;
        console.error(`  FAIL  ${uid}  ${err.message}`);
        continue;
      }
    }
    changed += 1;
  }

  console.log(`\n${snap.size} users, ${changed} ${apply ? 'updated' : 'to update'}, ` +
    `${skipped} already correct, ${missing} orphaned, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
