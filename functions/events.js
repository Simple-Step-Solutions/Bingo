const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const { db, callableOpts } = require('./lib/db');
const { requireRole, writeAudit } = require('./lib/guards');
const { getActiveEvent, toMillis } = require('./lib/events');

const STATUSES = ['draft', 'active', 'paused', 'archived'];

const EDITABLE = [
  'name', 'startsAt', 'endsAt', 'boardSize', 'difficulty',
  'bingoPrize', 'rafflePrize', 'raffleEnabled', 'raffleRequirement',
  'raffleDescription', 'freeSpaceName', 'freeSpaceTask',
];

const clean = (data) => {
  const out = {};
  for (const key of EDITABLE) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
};

const validate = (fields) => {
  if (fields.name !== undefined
      && (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 120)) {
    throw new HttpsError('invalid-argument', 'Give the event a name.');
  }
  if (fields.boardSize !== undefined
      && (!Number.isInteger(fields.boardSize) || fields.boardSize < 3 || fields.boardSize > 6)) {
    throw new HttpsError('invalid-argument', 'Board size must be between 3 and 6.');
  }
  if (fields.difficulty !== undefined
      && (typeof fields.difficulty !== 'number' || fields.difficulty < 0 || fields.difficulty > 100)) {
    throw new HttpsError('invalid-argument', 'Difficulty must be between 0 and 100.');
  }

  const starts = toMillis(fields.startsAt);
  const ends = toMillis(fields.endsAt);
  if (fields.startsAt && starts === null) {
    throw new HttpsError('invalid-argument', 'That start date is not valid.');
  }
  if (fields.endsAt && ends === null) {
    throw new HttpsError('invalid-argument', 'That end date is not valid.');
  }
  if (starts && ends && ends <= starts) {
    throw new HttpsError('invalid-argument', 'The event has to end after it starts.');
  }
};

exports.createEvent = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const fields = clean(request.data || {});
  validate(fields);

  if (!fields.name) throw new HttpsError('invalid-argument', 'Give the event a name.');

  const ref = await db().collection('events').add({
    ...fields,
    boardSize: fields.boardSize || 3,
    difficulty: fields.difficulty ?? 50,
    // Draft, deliberately. Creating an event should never take the running one
    // out from under players mid-visit; activating is a separate decision.
    status: 'draft',
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'create_event',
    targetUid: ref.id,
    details: { name: fields.name },
  });

  return { ok: true, eventId: ref.id };
});

exports.updateEvent = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const { eventId, status } = request.data || {};
  if (typeof eventId !== 'string' || !eventId) {
    throw new HttpsError('invalid-argument', 'eventId is required.');
  }

  const ref = db().collection('events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such event.');

  const fields = clean(request.data || {});
  validate(fields);

  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      throw new HttpsError('invalid-argument', 'Not a valid status.');
    }
    // Reopening an archived event would resurrect a leaderboard that has
    // already been published and prizes already handed out.
    if (snap.data().status === 'archived' && status !== 'archived') {
      throw new HttpsError('failed-precondition',
        'An archived event cannot be reopened. Create a new one instead.');
    }
    fields.status = status;
  }

  if (Object.keys(fields).length === 0) {
    throw new HttpsError('invalid-argument', 'Nothing to change.');
  }

  await ref.set(fields, { merge: true });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'update_event',
    targetUid: eventId,
    details: { changed: Object.keys(fields), status: fields.status || null },
  });

  return { ok: true };
});

/**
 * Point the game at an event.
 *
 * Archives whatever was running rather than deleting it, so the chamber keeps
 * its year-over-year foot-traffic numbers. Those are the figures that sell
 * renewals to member businesses, and they are exactly what the old
 * wipe-and-restart approach destroyed.
 */
exports.setActiveEvent = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const { eventId, archivePrevious } = request.data || {};
  if (typeof eventId !== 'string' || !eventId) {
    throw new HttpsError('invalid-argument', 'eventId is required.');
  }

  const ref = db().collection('events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such event.');
  if (snap.data().status === 'archived') {
    throw new HttpsError('failed-precondition', 'That event is archived.');
  }

  const settingsRef = db().collection('settings').doc('global');
  const settingsSnap = await settingsRef.get();
  const previousId = settingsSnap.exists ? settingsSnap.data().activeEventId : null;

  const batch = db().batch();

  if (previousId && previousId !== eventId && archivePrevious !== false) {
    batch.set(db().collection('events').doc(previousId), {
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  batch.set(ref, { status: 'active' }, { merge: true });
  batch.set(settingsRef, { activeEventId: eventId }, { merge: true });

  await batch.commit();

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'set_active_event',
    targetUid: eventId,
    details: { previousEventId: previousId || null, name: snap.data().name || null },
  });

  return { ok: true, previousEventId: previousId || null };
});

/**
 * One-time migration from the single global game to a real event.
 *
 * Idempotent: if an active event already exists it reports and does nothing.
 * Stamps existing completions, boards and raffle entries with the new event id
 * so historical data stays attributable instead of being orphaned.
 */
exports.migrateToEvents = onCall(callableOpts({ timeoutSeconds: 540 }), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'admin');

  const settingsRef = db().collection('settings').doc('global');
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};

  if (settings.activeEventId) {
    return { ok: true, migrated: false, reason: 'An active event already exists.', eventId: settings.activeEventId };
  }

  const eventRef = await db().collection('events').add({
    name: settings.chamberName ? `${settings.chamberName} Bingo` : 'Chamber Bingo',
    status: settings.gamePaused === true ? 'paused' : 'active',
    startsAt: null,
    endsAt: null,
    boardSize: settings.boardSize || 3,
    difficulty: typeof settings.difficulty === 'number' ? settings.difficulty : 50,
    bingoPrize: settings.bingoPrize || null,
    raffleEnabled: settings.raffleEnabled !== false,
    raffleRequirement: settings.raffleRequirement || null,
    raffleDescription: settings.raffleDescription || null,
    freeSpaceName: settings.freeSpaceName || 'FREE',
    freeSpaceTask: settings.freeSpaceTask || null,
    migratedFromGlobal: true,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  const eventId = eventRef.id;
  const counts = {};

  const stamp = async (collectionName) => {
    const snap = await db().collection(collectionName).get();
    let n = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db().batch();
      for (const d of snap.docs.slice(i, i + 400)) {
        if (d.data().eventId) continue;
        batch.set(d.ref, { eventId }, { merge: true });
        n += 1;
      }
      await batch.commit();
    }
    counts[collectionName] = n;
  };

  await stamp('completions');
  await stamp('boards');
  await stamp('raffle_entries');
  await stamp('wins');

  await settingsRef.set({ activeEventId: eventId }, { merge: true });

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'migrate_to_events',
    targetUid: eventId,
    details: counts,
  });

  return { ok: true, migrated: true, eventId, counts };
});

/** What the client needs to render the current game state. */
exports.getActiveEventInfo = onCall(callableOpts({ maxInstances: 20 }), async () => {
  const event = await getActiveEvent();
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    startsAt: event.startsAt ? new Date(toMillis(event.startsAt)).toISOString() : null,
    endsAt: event.endsAt ? new Date(toMillis(event.endsAt)).toISOString() : null,
    synthetic: !!event.synthetic,
  };
});
