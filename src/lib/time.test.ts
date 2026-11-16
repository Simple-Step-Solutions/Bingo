import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whenOf, whenMs, formatWhen, isToday } from './time';

const iso = '2026-11-16T15:30:00.000Z';
const firestoreTs = { seconds: Date.parse(iso) / 1000, nanoseconds: 0, toDate: () => new Date(iso) };

test('a server-written record (Firestore Timestamp) has a real date', () => {
  assert.equal(whenOf({ timestamp: firestoreTs })?.toISOString(), iso);
  // What the business page did before: Invalid Date.
  assert.ok(Number.isNaN(new Date(firestoreTs as unknown as string).getTime()));
});

test('timestampIso wins when present', () => {
  assert.equal(whenOf({ timestamp: firestoreTs, timestampIso: iso })?.toISOString(), iso);
});

test('a browser-written record (ISO string) still works', () => {
  assert.equal(whenOf({ timestamp: iso })?.toISOString(), iso);
});

test('a pending server timestamp (null until the write lands) or junk is no date, not a crash', () => {
  assert.equal(whenOf({ timestamp: null }), null);
  assert.equal(whenOf({ timestamp: 'not a date' }), null);
  assert.equal(whenOf({ timestamp: {} }), null);
  assert.equal(whenOf(undefined), null);
  assert.equal(formatWhen({ timestamp: null }), '');
  assert.equal(whenMs({ timestamp: null }), 0);
});

test('a plain {seconds} object (from a cache or a copy) works', () => {
  assert.equal(whenOf({ timestamp: { seconds: Date.parse(iso) / 1000 } })?.toISOString(), iso);
});

test('isToday compares calendar days', () => {
  assert.equal(isToday({ timestamp: firestoreTs }, new Date(iso)), true);
  assert.equal(isToday({ timestamp: firestoreTs }, new Date('2026-11-20T12:00:00Z')), false);
});
