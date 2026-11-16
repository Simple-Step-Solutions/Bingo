const test = require('node:test');
const assert = require('node:assert');

const { claimDecision, claimRequestId } = require('../lib/claims');

test('the owner on file gets their business straight away', () => {
  assert.equal(claimDecision({ callerEmail: 'brie@peekskillcoffee.com', loginEmail: 'brie@peekskillcoffee.com' }), 'grant');
  assert.equal(claimDecision({ callerEmail: 'Brie@PeekskillCoffee.com', loginEmail: 'brie@peekskillcoffee.com ' }), 'grant');
});

test('anyone else holding the poster code waits for the chamber', () => {
  assert.equal(claimDecision({ callerEmail: 'someone@gmail.com', loginEmail: 'brie@peekskillcoffee.com' }), 'review');
});

test('no login email on file means the chamber decides', () => {
  assert.equal(claimDecision({ callerEmail: 'brie@peekskillcoffee.com', loginEmail: null }), 'review');
  assert.equal(claimDecision({ callerEmail: 'brie@peekskillcoffee.com', loginEmail: '' }), 'review');
});

test('a caller with no email never matches', () => {
  assert.equal(claimDecision({ callerEmail: '', loginEmail: '' }), 'review');
  assert.equal(claimDecision({ callerEmail: undefined, loginEmail: undefined }), 'review');
});

test('request ids dedupe per person per business', () => {
  assert.equal(claimRequestId('biz1', 'uid1'), 'biz1_uid1');
});
