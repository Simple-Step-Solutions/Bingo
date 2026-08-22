const test = require('node:test');
const assert = require('node:assert');

const { eventBlockReason, boardIdFor, completionIdFor, toMillis } = require('../lib/events');

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-09-15T12:00:00.000Z');

test('an open event blocks nothing', () => {
  assert.equal(eventBlockReason({ status: 'active', startsAt: null, endsAt: null }, NOW), null);
  assert.equal(eventBlockReason({
    status: 'active',
    startsAt: new Date(NOW - HOUR).toISOString(),
    endsAt: new Date(NOW + HOUR).toISOString(),
  }, NOW), null);
});

test('a closed or not-yet-open event blocks, with a reason a player can act on', () => {
  const notYet = eventBlockReason({
    status: 'active', startsAt: new Date(NOW + 48 * HOUR).toISOString(), endsAt: null,
  }, NOW);
  assert.match(notYet, /opens on/i);

  const over = eventBlockReason({
    status: 'active', startsAt: null, endsAt: new Date(NOW - HOUR).toISOString(),
  }, NOW);
  assert.match(over, /closed/i);
});

test('every non-active status blocks', () => {
  for (const status of ['paused', 'archived', 'draft']) {
    const reason = eventBlockReason({ status, startsAt: null, endsAt: null }, NOW);
    assert.ok(reason, `status ${status} should block`);
    assert.equal(typeof reason, 'string');
  }
});

test('a missing event blocks rather than defaulting open', () => {
  assert.ok(eventBlockReason(null, NOW));
  assert.ok(eventBlockReason(undefined, NOW));
});

test('the boundary instants are inclusive', () => {
  // Standing at the counter at exactly the opening minute should work.
  assert.equal(eventBlockReason({
    status: 'active', startsAt: new Date(NOW).toISOString(), endsAt: null,
  }, NOW), null);
  assert.equal(eventBlockReason({
    status: 'active', startsAt: null, endsAt: new Date(NOW).toISOString(),
  }, NOW), null);
});

test('board ids are event-scoped, and legacy boards keep their bare id', () => {
  assert.equal(boardIdFor('legacy', 'user1'), 'user1');
  assert.equal(boardIdFor('evt2026', 'user1'), 'evt2026_user1');
});

test('completion ids let a business be revisited in a later event', () => {
  // The whole point: within an event the id collides and blocks a duplicate,
  // across events it must not, or last season's visit would permanently
  // consume this season's square.
  const first = completionIdFor('evt2026spring', 'user1', 'bizA');
  const second = completionIdFor('evt2026fall', 'user1', 'bizA');
  assert.notEqual(first, second);
  assert.equal(completionIdFor('evt2026fall', 'user1', 'bizA'), second, 'not deterministic');
  assert.equal(completionIdFor('legacy', 'user1', 'bizA'), 'user1_bizA');
});

test('toMillis accepts the shapes Firestore actually hands back', () => {
  const iso = '2026-09-15T12:00:00.000Z';
  assert.equal(toMillis(iso), NOW);
  assert.equal(toMillis(new Date(NOW)), NOW);
  assert.equal(toMillis({ toMillis: () => NOW }), NOW);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('not a date'), null);
  assert.equal(toMillis(undefined), null);
});
