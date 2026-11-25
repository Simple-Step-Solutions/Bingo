import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyAuthError, shouldRetryWithRedirect, emailAuthError } from './authErrors';

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

test('a failed email sign-in points new players to Create Account', () => {
  const e = emailAuthError('auth/invalid-credential', 'signin');
  assert.match(e.text, /create an account/i);
  assert.equal(e.switchTo, 'email-signup');
  // Older SDKs report the two halves separately.
  assert.equal(emailAuthError('auth/user-not-found', 'signin').switchTo, 'email-signup');
  assert.equal(emailAuthError('auth/wrong-password', 'signin').switchTo, 'email-signup');
});

test('signing up with an email that already has an account points to Sign In', () => {
  const e = emailAuthError('auth/email-already-in-use', 'signup');
  assert.match(e.text, /already/i);
  assert.equal(e.switchTo, 'email-signin');
});

test('email failures never show the raw Firebase message', () => {
  for (const code of ['auth/weak-password', 'auth/invalid-email', 'auth/some-new-code', undefined]) {
    for (const mode of ['signin', 'signup'] as const) {
      const { text } = emailAuthError(code, mode);
      assert.ok(text.length > 0);
      assert.doesNotMatch(text, /firebase|auth\//i);
    }
  }
  assert.match(emailAuthError('auth/weak-password', 'signup').text, /6 characters/);
  assert.equal(emailAuthError('auth/too-many-requests', 'signin').switchTo, undefined);
});
