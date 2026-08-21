/**
 * Firestore security rules tests.
 *
 * Run with:  npm run test:rules
 * (that wraps `firebase emulators:exec`, which needs a JRE on PATH)
 *
 * Every test here corresponds to a hole found in the Phase 0 review.
 * If one of these starts failing, a real exploit has been reopened.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where,
} from 'firebase/firestore';

const PROJECT_ID = 'sss-hvgcc-bingo-rules-test';
const BOOTSTRAP_EMAIL = 'logan@simplestepsolutions.com';

let env: RulesTestEnvironment;

/** An authed context whose token carries a verified email. */
const authed = (uid: string, email = `${uid}@example.com`, emailVerified = true) =>
  env.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // Seed with rules disabled.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/player1'), {
      uid: 'player1', email: 'player1@example.com', displayName: 'Player One',
      role: 'player', roleSelected: true, town: 'Yorktown',
    });
    await setDoc(doc(db, 'users/player2'), {
      uid: 'player2', email: 'player2@example.com', displayName: 'Player Two',
      role: 'player', roleSelected: true, town: 'Yorktown',
    });
    await setDoc(doc(db, 'users/newbie'), {
      uid: 'newbie', email: 'newbie@example.com', displayName: 'New Bie',
      role: 'player', roleSelected: false, town: '',
    });
    await setDoc(doc(db, 'users/chamber1'), {
      uid: 'chamber1', email: 'chamber1@example.com', role: 'chamber',
      roleSelected: true, town: 'Yorktown',
    });
    await setDoc(doc(db, 'users/admin1'), {
      uid: 'admin1', email: 'admin1@example.com', role: 'admin',
      roleSelected: true, town: 'Yorktown',
    });
    await setDoc(doc(db, 'users/bizowner'), {
      uid: 'bizowner', email: 'bizowner@example.com', role: 'business',
      roleSelected: true, businessId: 'bizA',
    });

    await setDoc(doc(db, 'businesses/bizA'), { name: 'Cafe A', town: 'Yorktown' });
    await setDoc(doc(db, 'businesses/bizB'), { name: 'Shop B', town: 'Peekskill' });

    await setDoc(doc(db, 'completions/c1'), { userId: 'player1', businessId: 'bizA', town: 'Yorktown' });
    await setDoc(doc(db, 'completions/c2'), { userId: 'player2', businessId: 'bizB', town: 'Peekskill' });

    await setDoc(doc(db, 'raffle_entries/r1'), {
      userId: 'player1', userName: 'Player One', userEmail: 'player1@example.com',
    });
    await setDoc(doc(db, 'raffle_entries/r2'), {
      userId: 'player2', userName: 'Player Two', userEmail: 'player2@example.com',
    });

    await setDoc(doc(db, 'invites/inv1'), {
      token: 'SECRETTOKEN', role: 'chamber', used: false,
      expiresAt: '2099-01-01T00:00:00.000Z', createdBy: 'admin1',
      emailHint: 'someone@a-real-business.com',
    });

    await setDoc(doc(db, 'settings/global'), { boardSize: 3, difficulty: 50 });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'all', message: 'hi', type: 'info' });
  });
});

// ---------------------------------------------------------------------------

describe('privilege escalation', () => {
  test('a player cannot promote themselves to admin', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { role: 'admin' }));
  });

  test('a player cannot promote themselves to chamber', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { role: 'chamber' }));
  });

  test('THE ORIGINAL HOLE: a new user cannot pick admin during role selection', async () => {
    const db = authed('newbie');
    await assertFails(
      setDoc(doc(db, 'users/newbie'), { role: 'admin', roleSelected: true }, { merge: true }),
    );
  });

  test('a new user cannot pick chamber during role selection', async () => {
    const db = authed('newbie');
    await assertFails(
      setDoc(doc(db, 'users/newbie'), { role: 'chamber', roleSelected: true }, { merge: true }),
    );
  });

  test('a new user CAN complete role selection as a player', async () => {
    const db = authed('newbie');
    await assertSucceeds(
      setDoc(doc(db, 'users/newbie'), { role: 'player', roleSelected: true }, { merge: true }),
    );
  });

  test('role selection cannot be replayed once roleSelected is true', async () => {
    const db = authed('player1');
    await assertFails(
      setDoc(doc(db, 'users/player1'), { role: 'chamber', roleSelected: true }, { merge: true }),
    );
  });

  test('a signup cannot create its own doc as admin', async () => {
    const db = authed('fresh');
    await assertFails(setDoc(doc(db, 'users/fresh'), {
      uid: 'fresh', email: 'fresh@example.com', displayName: '',
      role: 'admin', roleSelected: false, town: '',
    }));
  });

  test('a signup cannot create its doc pre-selected', async () => {
    const db = authed('fresh');
    await assertFails(setDoc(doc(db, 'users/fresh'), {
      uid: 'fresh', email: 'fresh@example.com', displayName: '',
      role: 'player', roleSelected: true, town: '',
    }));
  });

  test('a signup cannot smuggle extra fields into its own doc', async () => {
    const db = authed('fresh');
    await assertFails(setDoc(doc(db, 'users/fresh'), {
      uid: 'fresh', email: 'fresh@example.com', displayName: '',
      role: 'player', roleSelected: false, town: '', businessId: 'bizA',
    }));
  });

  test('a signup cannot claim an email it does not own', async () => {
    const db = authed('fresh', 'fresh@example.com');
    await assertFails(setDoc(doc(db, 'users/fresh'), {
      uid: 'fresh', email: BOOTSTRAP_EMAIL, displayName: '',
      role: 'player', roleSelected: false, town: '',
    }));
  });

  test('the real client bootstrap still works', async () => {
    const db = authed('fresh');
    await assertSucceeds(setDoc(doc(db, 'users/fresh'), {
      uid: 'fresh', email: 'fresh@example.com', displayName: '',
      role: 'player', roleSelected: false, town: '',
    }));
  });

  test('chamber staff cannot change anyone role', async () => {
    const db = authed('chamber1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { role: 'chamber' }));
  });

  test('chamber staff cannot rewrite a user email', async () => {
    const db = authed('chamber1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { email: 'attacker@evil.com' }));
  });

  test('an admin can still change a role', async () => {
    const db = authed('admin1');
    await assertSucceeds(updateDoc(doc(db, 'users/player1'), { role: 'business' }));
  });

  test('the bootstrap admin email works only when verified', async () => {
    const verified = authed('boot', BOOTSTRAP_EMAIL, true);
    await assertSucceeds(setDoc(doc(verified, 'settings/global'), { boardSize: 4 }, { merge: true }));

    const unverified = authed('boot2', BOOTSTRAP_EMAIL, false);
    await assertFails(setDoc(doc(unverified, 'settings/global'), { boardSize: 5 }, { merge: true }));
  });
});

describe('profile self-edits still work', () => {
  test('a player can update ordinary profile fields', async () => {
    const db = authed('player1');
    await assertSucceeds(updateDoc(doc(db, 'users/player1'), {
      displayName: 'Renamed', lastActive: 'now',
      currentLocation: { lat: 41.2, lng: -73.8 },
    }));
  });

  test('a player can register an FCM token', async () => {
    const db = authed('player1');
    await assertSucceeds(updateDoc(doc(db, 'users/player1'), { fcmTokens: ['abc'] }));
  });

  test('a player can reset their own board (pre-Phase-2 behaviour)', async () => {
    const db = authed('player1');
    await assertSucceeds(updateDoc(doc(db, 'users/player1'), {
      bingoBoard: [], onboardingComplete: false,
    }));
  });

  test('a player cannot link themselves to a business', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { businessId: 'bizA' }));
  });

  test('a player cannot edit another user', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'users/player2'), { displayName: 'hacked' }));
  });

  test('a player cannot read another user profile', async () => {
    const db = authed('player1');
    await assertFails(getDoc(doc(db, 'users/player2')));
  });

  test('a player cannot list all users', async () => {
    const db = authed('player1');
    await assertFails(getDocs(collection(db, 'users')));
  });

  test('a player cannot delete anyone', async () => {
    const db = authed('player1');
    await assertFails(deleteDoc(doc(db, 'users/player1')));
  });
});

describe('PII exposure', () => {
  test('a player cannot list every raffle entry', async () => {
    const db = authed('player1');
    await assertFails(getDocs(collection(db, 'raffle_entries')));
  });

  test('a player CAN list their own raffle entries', async () => {
    const db = authed('player1');
    await assertSucceeds(
      getDocs(query(collection(db, 'raffle_entries'), where('userId', '==', 'player1'))),
    );
  });

  test('a player cannot query another user raffle entries', async () => {
    const db = authed('player1');
    await assertFails(
      getDocs(query(collection(db, 'raffle_entries'), where('userId', '==', 'player2'))),
    );
  });

  test('a player cannot list every completion', async () => {
    const db = authed('player1');
    await assertFails(getDocs(collection(db, 'completions')));
  });

  test('a player CAN list their own completions', async () => {
    const db = authed('player1');
    await assertSucceeds(
      getDocs(query(collection(db, 'completions'), where('userId', '==', 'player1'))),
    );
  });

  test('a business owner CAN list completions for their own business', async () => {
    const db = authed('bizowner');
    await assertSucceeds(
      getDocs(query(collection(db, 'completions'), where('businessId', '==', 'bizA'))),
    );
  });

  test('a business owner cannot list completions for another business', async () => {
    const db = authed('bizowner');
    await assertFails(
      getDocs(query(collection(db, 'completions'), where('businessId', '==', 'bizB'))),
    );
  });

  test('chamber staff can still list everything they need', async () => {
    const db = authed('chamber1');
    await assertSucceeds(getDocs(collection(db, 'completions')));
    await assertSucceeds(getDocs(collection(db, 'raffle_entries')));
    await assertSucceeds(getDocs(collection(db, 'users')));
  });
});

describe('invites', () => {
  test('a player cannot list invites', async () => {
    const db = authed('player1');
    await assertFails(getDocs(collection(db, 'invites')));
  });

  test('a player cannot read a single invite', async () => {
    const db = authed('player1');
    await assertFails(getDoc(doc(db, 'invites/inv1')));
  });

  test('a player cannot query an invite by token', async () => {
    const db = authed('player1');
    await assertFails(
      getDocs(query(collection(db, 'invites'), where('token', '==', 'SECRETTOKEN'))),
    );
  });

  test('nobody can replay a spent invite', async () => {
    const db = authed('chamber1');
    await assertFails(updateDoc(doc(db, 'invites/inv1'), { used: false }));
  });

  test('a player cannot mark an invite used', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'invites/inv1'), { used: true, usedBy: 'player1' }));
  });

  test('chamber staff can still read and create invites', async () => {
    const db = authed('chamber1');
    await assertSucceeds(getDocs(collection(db, 'invites')));
    await assertSucceeds(addDoc(collection(db, 'invites'), {
      token: 'X', role: 'business', used: false, createdBy: 'chamber1',
    }));
  });
});

describe('audit log', () => {
  test('the actor cannot be forged', async () => {
    const db = authed('chamber1');
    await assertFails(addDoc(collection(db, 'audit_log'), {
      actorUid: 'admin1', actorEmail: 'admin1@example.com',
      action: 'change_role', targetUid: 'player1', details: {},
    }));
  });

  test('an honest entry is accepted', async () => {
    const db = authed('chamber1');
    await assertSucceeds(addDoc(collection(db, 'audit_log'), {
      actorUid: 'chamber1', actorEmail: 'chamber1@example.com',
      action: 'reset_board', targetUid: 'player1', details: {},
    }));
  });

  test('a player cannot write or read the audit log', async () => {
    const db = authed('player1');
    await assertFails(addDoc(collection(db, 'audit_log'), { actorUid: 'player1', action: 'x' }));
    await assertFails(getDocs(collection(db, 'audit_log')));
  });

  test('the log is append-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_log/a1'), { actorUid: 'admin1', action: 'x' });
    });
    const db = authed('admin1');
    await assertFails(updateDoc(doc(db, 'audit_log/a1'), { action: 'y' }));
    await assertFails(deleteDoc(doc(db, 'audit_log/a1')));
  });
});

describe('settings and businesses', () => {
  test('a player cannot write settings', async () => {
    const db = authed('player1');
    await assertFails(setDoc(doc(db, 'settings/global'), { boardSize: 5 }, { merge: true }));
  });

  test('a player cannot write businesses', async () => {
    const db = authed('player1');
    await assertFails(setDoc(doc(db, 'businesses/bizA'), { name: 'Pwned' }, { merge: true }));
  });

  test('a business owner cannot edit their own business record', async () => {
    const db = authed('bizowner');
    await assertFails(setDoc(doc(db, 'businesses/bizA'), { task: 'free stuff' }, { merge: true }));
  });

  test('chamber staff can write settings and businesses', async () => {
    const db = authed('chamber1');
    await assertSucceeds(setDoc(doc(db, 'settings/global'), { boardSize: 4 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'businesses/bizA'), { task: 'Buy a coffee' }, { merge: true }));
  });
});

describe('notifications', () => {
  test('a player cannot broadcast a notification', async () => {
    const db = authed('player1');
    await assertFails(addDoc(collection(db, 'notifications'), {
      userId: 'all', message: 'spam', type: 'info',
    }));
  });

  test('chamber staff can broadcast', async () => {
    const db = authed('chamber1');
    await assertSucceeds(addDoc(collection(db, 'notifications'), {
      userId: 'all', message: 'Game starts Saturday', type: 'game',
    }));
  });
});

describe('unauthenticated access', () => {
  test('an anonymous visitor can read nothing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'settings/global')));
    await assertFails(getDocs(collection(db, 'businesses')));
    await assertFails(getDoc(doc(db, 'users/player1')));
  });
});

// A placeholder so the suite fails loudly if the seed data ever stops loading.
test('seed data is present', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'users/player1'));
    assert.equal(snap.exists(), true);
  });
});
