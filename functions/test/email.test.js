const test = require('node:test');
const assert = require('node:assert');

const { normalizeLoginEmail } = require('../lib/email');

test('login emails are cleaned of pasted spaces and lowercased', () => {
  assert.equal(normalizeLoginEmail('\u00A0mrose@sportimepickleball.com\u00A0'), 'mrose@sportimepickleball.com');
  assert.equal(normalizeLoginEmail('Brie@PeekskillCoffee.com'), 'brie@peekskillcoffee.com');
  assert.equal(normalizeLoginEmail('a\u200B@b.co'), 'a@b.co');
});

test('blank or missing clears the login email', () => {
  assert.equal(normalizeLoginEmail(null), null);
  assert.equal(normalizeLoginEmail(undefined), null);
  assert.equal(normalizeLoginEmail('  '), null);
});

test('anything else is rejected', () => {
  assert.equal(normalizeLoginEmail('not an email'), undefined);
  assert.equal(normalizeLoginEmail('two@at@signs.com'), undefined);
  assert.equal(normalizeLoginEmail(42), undefined);
  assert.equal(normalizeLoginEmail(`${'a'.repeat(250)}@b.com`), undefined);
});
