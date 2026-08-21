/**
 * Firestore security rules tests.
 *
 * Run with:  npm run test:rules
 * (that wraps `firebase emulators:exec`, which needs a JRE on PATH)
 *
 * Every test here corresponds to a hole found in the Phase 0 review, or to a
 * property Phase 2 depends on. If one starts failing, a real exploit has been
 * reopened.
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

/** An authed context whose token carries a verified email and no role claim. */
const authed = (uid: string, email = `${uid}@example.com`, emailVerified = true) =>
  env.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();

/**
 * An authed context carrying a role claim, which is what syncRoleClaims
 * produces and what the rules read first.
 */
const authedAs = (uid: string, claims: Record<string, unknown>, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true, ...claims }).firestore();

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
    // Has a chamber CLAIM but a player document. Proves the claim path works
    // on its own, which is what the rules will rely on after step 8.
    await setDoc(doc(db, 'users/claimchamber'), {
      uid: 'claimchamber', email: 'claimchamber@example.com',
      role: 'player', roleSelected: true,
    });

    await setDoc(doc(db, 'businesses/bizA'), { name: 'Cafe A', town: 'Yorktown' });
    await setDoc(doc(db, 'businesses/bizB'), { name: 'Shop B', town: 'Peekskill' });

    await setDoc(doc(db, 'business_secrets/bizA'), {
      businessId: 'bizA', code: 'HVG-A2K7-QW9Z-M4TR-P8XN', codeHash: 'deadbeef',
    });
    await setDoc(doc(db, 'business_secrets/bizB'), {
      businessId: 'bizB', code: 'HVG-ZZZZ-ZZZZ-ZZZZ-ZZZZ', codeHash: 'cafebabe',
    });
    await setDoc(doc(db, 'code_index/deadbeef'), { businessId: 'bizA', active: true });

    await setDoc(doc(db, 'boards/player1'), {
      cells: ['bizA', 'bizB', 'FREE'], size: 3, town: 'Yorktown',
    });

    await setDoc(doc(db, 'completions/player1_bizA'), {
      userId: 'player1', businessId: 'bizA', town: 'Yorktown',
    });
    await setDoc(doc(db, 'completions/player2_bizB'), {
      userId: 'player2', businessId: 'bizB', town: 'Peekskill',
    });

    await setDoc(doc(db, 'wins/player1'), {
      userId: 'player1', userName: 'Player One', redeemed: false,
    });
    await setDoc(doc(db, 'verification_attempts/a1'), {
      uid: 'player1', outcome: 'out_of_range', distanceM: 4200,
    });
    await setDoc(doc(db, 'rate_limits/verify_player1'), { count: 1, windowStart: 0 });

    await setDoc(doc(db, 'raffle_entries/r1'), {
      userId: 'player1', userName: 'Player One', userEmail: 'player1@example.com',
    });
    await setDoc(doc(db, 'raffle_entries/r2'), {
      userId: 'player2', userName: 'Player Two', userEmail: 'player2@example.com',
    });

    // Keyed by the token hash, and carrying no plaintext.
    await setDoc(doc(db, 'invites/a1b2c3hash'), {
      role: 'chamber', used: false,
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

  test('chamber staff cannot link a user to a business', async () => {
    // businessId now implies a custom claim, so it has to move through
    // setUserRole or the token and the document drift apart.
    const db = authed('chamber1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { businessId: 'bizA' }));
  });

  test('even an admin cannot change a role directly any more', async () => {
    // Role changes go through the setUserRole callable, which moves the claim
    // in the same operation and revokes refresh tokens on demotion.
    const db = authed('admin1');
    await assertFails(updateDoc(doc(db, 'users/player1'), { role: 'business' }));
  });

  test('the hardcoded bootstrap email no longer grants anything', async () => {
    // It used to be trusted in the rules. It is now a server-side check inside
    // the bootstrapAdmin callable, so holding the address proves nothing here.
    const db = authed('boot', BOOTSTRAP_EMAIL, true);
    await assertFails(setDoc(doc(db, 'settings/global'), { boardSize: 9 }, { merge: true }));
  });
});

describe('custom claims (dual trust)', () => {
  test('a chamber CLAIM grants chamber access with a player document', async () => {
    const db = authedAs('claimchamber', { role: 'chamber' });
    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(setDoc(doc(db, 'settings/global'), { boardSize: 4 }, { merge: true }));
  });

  test('a chamber DOCUMENT still grants access with no claim', async () => {
    // The fallback that keeps cached bundles working during the overlap.
    const db = authed('chamber1');
    await assertSucceeds(getDocs(collection(db, 'users')));
  });

  test('DOCUMENTED LAG: a stale chamber claim still works after demotion', async () => {
    // Rules cannot check token revocation, so a demoted user keeps rule-level
    // access until their token refreshes, up to an hour. This is asserted so
    // nobody "fixes" it here instead of in the callables, which do check
    // tokensValidAfterTime. If this test starts failing, check that the
    // callables still enforce it.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/claimchamber'),
        { role: 'player' }, { merge: true });
    });
    const db = authedAs('claimchamber', { role: 'chamber' });
    await assertSucceeds(getDocs(collection(db, 'users')));
  });

  test('a forged-looking claim is still just a claim the server signed', async () => {
    // Sanity check that an absent claim means player, not "no role at all".
    const db = authedAs('player1', {});
    await assertFails(getDocs(collection(db, 'users')));
  });

  test('a business claim scopes completions without a document read', async () => {
    const db = authedAs('bizowner', { role: 'business', bid: 'bizA' });
    await assertSucceeds(
      getDocs(query(collection(db, 'completions'), where('businessId', '==', 'bizA'))),
    );
    await assertFails(
      getDocs(query(collection(db, 'completions'), where('businessId', '==', 'bizB'))),
    );
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

describe('boards are server-owned', () => {
  test('a player CAN read their own board', async () => {
    const db = authed('player1');
    await assertSucceeds(getDoc(doc(db, 'boards/player1')));
  });

  test('THE STRIP-MALL ATTACK: a player cannot write their own board', async () => {
    // Rewriting the board to nine businesses in one plaza wins the game in ten
    // minutes without leaving the parking lot, and is far cheaper than
    // spoofing GPS nine times.
    const db = authed('player1');
    await assertFails(setDoc(doc(db, 'boards/player1'), {
      cells: ['bizA', 'bizA', 'bizA'], size: 3,
    }));
  });

  test('a player cannot read another player board', async () => {
    const db = authed('player1');
    await assertFails(getDoc(doc(db, 'boards/player2')));
  });

  test('not even chamber or admin can write a board', async () => {
    const chamber = authed('chamber1');
    await assertFails(setDoc(doc(chamber, 'boards/player1'), { cells: [], size: 3 }));
    const admin = authed('admin1');
    await assertFails(setDoc(doc(admin, 'boards/player1'), { cells: [], size: 3 }));
  });

  test('chamber CAN read boards for support', async () => {
    const db = authed('chamber1');
    await assertSucceeds(getDoc(doc(db, 'boards/player1')));
  });
});

describe('business codes are unguessable', () => {
  test('a player cannot read any business secret', async () => {
    const db = authed('player1');
    await assertFails(getDoc(doc(db, 'business_secrets/bizA')));
    await assertFails(getDocs(collection(db, 'business_secrets')));
  });

  test('a business owner CAN read their own secret', async () => {
    const db = authed('bizowner');
    await assertSucceeds(getDoc(doc(db, 'business_secrets/bizA')));
  });

  test('a business owner cannot read another business secret', async () => {
    const db = authed('bizowner');
    await assertFails(getDoc(doc(db, 'business_secrets/bizB')));
  });

  test('nobody can list business secrets, not even chamber', async () => {
    // A list would hand over every code in the game in one request.
    const db = authed('chamber1');
    await assertFails(getDocs(collection(db, 'business_secrets')));
    await assertSucceeds(getDoc(doc(db, 'business_secrets/bizA')));
  });

  test('nobody can read the code index at all', async () => {
    for (const uid of ['player1', 'bizowner', 'chamber1', 'admin1']) {
      const db = authed(uid);
      await assertFails(getDoc(doc(db, 'code_index/deadbeef')));
    }
  });

  test('nobody can write a secret or an index entry', async () => {
    const db = authed('admin1');
    await assertFails(setDoc(doc(db, 'business_secrets/bizA'), { code: 'MINE' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'code_index/deadbeef'), { businessId: 'bizB' }, { merge: true }));
  });

  test('codes cannot be smuggled back onto the public business document', async () => {
    const db = authed('chamber1');
    await assertFails(setDoc(doc(db, 'businesses/bizA'),
      { qrCode: 'CHAMBER_bizA' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'businesses/bizA'),
      { nfcId: '04:A2:B3' }, { merge: true }));
  });
});

describe('completions are server-written', () => {
  test('a player cannot forge a completion', async () => {
    // This is what made the geofence, the duplicate check and the pause switch
    // all skippable: they were client-side ifs guarding an unguarded addDoc.
    const db = authed('player1');
    await assertFails(addDoc(collection(db, 'completions'), {
      userId: 'player1', businessId: 'bizB', town: 'Peekskill',
    }));
    await assertFails(setDoc(doc(db, 'completions/player1_bizB'), {
      userId: 'player1', businessId: 'bizB',
    }));
  });

  test('not even chamber can create a completion directly', async () => {
    const db = authed('chamber1');
    await assertFails(addDoc(collection(db, 'completions'), {
      userId: 'player1', businessId: 'bizB',
    }));
  });

  test('a completion cannot be edited after the fact', async () => {
    const db = authed('admin1');
    await assertFails(updateDoc(doc(db, 'completions/player1_bizA'), { businessId: 'bizB' }));
  });

  test('chamber can still delete a completion', async () => {
    const db = authed('chamber1');
    await assertSucceeds(deleteDoc(doc(db, 'completions/player1_bizA')));
  });
});

describe('wins and verification attempts', () => {
  test('a player can see their own win but not write one', async () => {
    const db = authed('player1');
    await assertSucceeds(getDoc(doc(db, 'wins/player1')));
    await assertFails(setDoc(doc(db, 'wins/player1'), { redeemed: true }, { merge: true }));
  });

  test('a player cannot declare themselves a winner', async () => {
    const db = authed('player2');
    await assertFails(setDoc(doc(db, 'wins/player2'), {
      userId: 'player2', redeemed: false,
    }));
  });

  test('a player cannot see another player win', async () => {
    const db = authed('player2');
    await assertFails(getDoc(doc(db, 'wins/player1')));
  });

  test('rejected attempts are visible to chamber and nobody else', async () => {
    const chamber = authed('chamber1');
    await assertSucceeds(getDocs(collection(chamber, 'verification_attempts')));

    const player = authed('player1');
    await assertFails(getDocs(collection(player, 'verification_attempts')));
    await assertFails(getDoc(doc(player, 'verification_attempts/a1')));
  });

  test('nobody can delete the evidence', async () => {
    const db = authed('admin1');
    await assertFails(deleteDoc(doc(db, 'verification_attempts/a1')));
  });
});

describe('rate limits', () => {
  test('nobody can read or clear their own rate limit bucket', async () => {
    for (const uid of ['player1', 'chamber1', 'admin1']) {
      const db = authed(uid);
      await assertFails(getDoc(doc(db, 'rate_limits/verify_player1')));
      await assertFails(deleteDoc(doc(db, 'rate_limits/verify_player1')));
    }
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
    await assertFails(getDoc(doc(db, 'invites/a1b2c3hash')));
  });

  test('a player cannot query an invite by token', async () => {
    const db = authed('player1');
    await assertFails(
      getDocs(query(collection(db, 'invites'), where('token', '==', 'SECRETTOKEN'))),
    );
  });

  test('nobody can replay a spent invite', async () => {
    const db = authed('chamber1');
    await assertFails(updateDoc(doc(db, 'invites/a1b2c3hash'), { used: false }));
  });

  test('a player cannot mark an invite used', async () => {
    const db = authed('player1');
    await assertFails(updateDoc(doc(db, 'invites/a1b2c3hash'), { used: true, usedBy: 'player1' }));
  });

  test('chamber can read invites but no longer create them directly', async () => {
    // Creation moved to the createInvite callable, which generates the token
    // with a CSPRNG and stores only its hash. A client-written invite would
    // have to carry a plaintext token, defeating the point.
    const db = authed('chamber1');
    await assertSucceeds(getDocs(collection(db, 'invites')));
    await assertFails(addDoc(collection(db, 'invites'), {
      token: 'X', role: 'business', used: false, createdBy: 'chamber1',
    }));
  });

  test('chamber cannot delete an invite to cover its tracks', async () => {
    const db = authed('chamber1');
    await assertFails(deleteDoc(doc(db, 'invites/a1b2c3hash')));
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
    await assertFails(getDoc(doc(db, 'boards/player1')));
    await assertFails(getDoc(doc(db, 'business_secrets/bizA')));
  });
});

// A placeholder so the suite fails loudly if the seed data ever stops loading.
test('seed data is present', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'users/player1'));
    assert.equal(snap.exists(), true);
  });
});
