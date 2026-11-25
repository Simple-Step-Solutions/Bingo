import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyAuthError, shouldRetryWithRedirect } from './authErrors';

test('common Google failures get plain-English messages', () => {
  assert.match(friendlyAuthError('auth/popup-blocked'), /pop-up/i);
  assert.match(friendlyAuthError('auth/network-request-failed'), /connection/i);
  assert.match(friendlyAuthError('auth/unauthorized-domain'), /chamber/i);
});

test('the user closing the window is not scolded', () => {
  assert.equal(friendlyAuthError('auth/popup-closed-by-user'), null);
  assert.equal(friendlyAuthError('auth/cancelled-popup-request'), null);
});

test('anything unknown still says something useful', () => {
  assert.match(friendlyAuthError('auth/some-new-code') ?? '', /try again/i);
  assert.match(friendlyAuthError(undefined) ?? '', /try again/i);
});

test('only failures a full-page redirect can get past fall back to one', () => {
  assert.equal(shouldRetryWithRedirect('auth/popup-blocked'), true);
  assert.equal(shouldRetryWithRedirect('auth/operation-not-supported-in-this-environment'), true);
  assert.equal(shouldRetryWithRedirect('auth/web-storage-unsupported'), true);
  assert.equal(shouldRetryWithRedirect('auth/popup-closed-by-user'), false);
  assert.equal(shouldRetryWithRedirect('auth/network-request-failed'), false);
  assert.equal(shouldRetryWithRedirect(undefined), false);
});
