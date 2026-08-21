const { db } = require('./db');

/**
 * Events (Phase 4).
 *
 * There was no game entity: one settings/global document, one season, one board
 * per player forever, and a single gamePaused boolean as the only lifecycle
 * control. Running the game again next spring meant wiping the data, which
 * throws away the year-over-year foot-traffic numbers that are what actually
 * sell renewals to member businesses.
 *
 * An event owns everything that varies per run: board size, difficulty, prizes,
 * raffle settings, and the window it is open. settings/global keeps only
 * chamber-wide branding and a pointer to the active event.
 */

const toMillis = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
};

/**
 * The event a visit would count towards, or null.
 *
 * Falls back to a synthetic event built from settings/global so the game keeps
 * working before the migration has run and before anyone has created a real
 * event. Without that fallback, deploying this would stop every verification
 * in the field until an admin happened to open the admin panel.
 */
const getActiveEvent = async () => {
  const settingsSnap = await db().collection('settings').doc('global').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};

  const activeId = settings.activeEventId;
  if (activeId) {
    const snap = await db().collection('events').doc(activeId).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }

  return {
    id: 'legacy',
    name: settings.chamberName ? `${settings.chamberName} Bingo` : 'Chamber Bingo',
    status: settings.gamePaused === true ? 'paused' : 'active',
    startsAt: null,
    endsAt: null,
    boardSize: settings.boardSize || 3,
    difficulty: typeof settings.difficulty === 'number' ? settings.difficulty : 50,
    bingoPrize: settings.bingoPrize || null,
    raffleEnabled: settings.raffleEnabled !== false,
    raffleRequirement: settings.raffleRequirement || null,
    synthetic: true,
  };
};

/**
 * Why a visit cannot be verified right now, or null if it can.
 *
 * Returns a message written for the player rather than a status code, because
 * "The game opens on Saturday" is a far better answer at a shop counter than
 * "failed-precondition".
 */
const eventBlockReason = (event, now = Date.now()) => {
  if (!event) return 'There is no active game right now.';
  if (event.status === 'paused') return 'The game is paused by the Chamber right now.';
  if (event.status === 'archived') return 'That game has finished.';
  if (event.status === 'draft') return 'The game has not opened yet.';

  const startsAt = toMillis(event.startsAt);
  if (startsAt && now < startsAt) {
    return `The game opens on ${new Date(startsAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })}.`;
  }

  const endsAt = toMillis(event.endsAt);
  if (endsAt && now > endsAt) return 'The game has closed. Thanks for playing.';

  return null;
};

/**
 * Board document id.
 *
 * Scoped to the event so a player gets a fresh board each season while their
 * history from previous events stays intact. The legacy id is kept unprefixed
 * so boards created before events existed keep resolving.
 */
const boardIdFor = (eventId, uid) => (eventId === 'legacy' ? uid : `${eventId}_${uid}`);

/**
 * Completion document id.
 *
 * Must include the event. The deterministic id is what makes double-completion
 * structurally impossible within an event, but without the event prefix a
 * player who visited a business last season could never visit it again, because
 * create() would collide with a completion from a game that has already ended.
 */
const completionIdFor = (eventId, uid, businessId) =>
  (eventId === 'legacy' ? `${uid}_${businessId}` : `${eventId}_${uid}_${businessId}`);

module.exports = { getActiveEvent, eventBlockReason, boardIdFor, completionIdFor, toMillis };
