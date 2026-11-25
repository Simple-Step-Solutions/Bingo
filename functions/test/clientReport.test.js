const test = require('node:test');
const assert = require('node:assert');

const { sanitizeReport } = require('../lib/clientReport');

test('a Google sign-in failure keeps what we need to diagnose it', () => {
  const out = sanitizeReport({
    kind: 'auth_google',
    code: 'auth/popup-closed-by-user',
    message: 'Firebase: Error (auth/popup-closed-by-user).',
    ref: 'K7Q2MX',
    context: { method: 'popup', platform: 'ios', inApp: 'Instagram', standalone: false, path: '/' },
  });
  assert.deepStrictEqual(out, {
    kind: 'auth_google',
    code: 'auth/popup-closed-by-user',
    message: 'Firebase: Error (auth/popup-closed-by-user).',
    ref: 'K7Q2MX',
    fn: null,
    context: { method: 'popup', platform: 'ios', inApp: 'Instagram', standalone: false, path: '/' },
  });
});

test('unknown kinds are refused, so the endpoint is not a general log sink', () => {
  assert.equal(sanitizeReport({ kind: 'anything', code: 'x' }), null);
  assert.equal(sanitizeReport(null), null);
  assert.equal(sanitizeReport('auth_google'), null);
});

test('emails and query strings never reach the logs', () => {
  const out = sanitizeReport({
    kind: 'callable',
    fn: 'redeemInvite',
    code: 'functions/permission-denied',
    message: 'Invite for Jane.Doe+bingo@Example.com was refused',
    context: { path: '/?invite=SECRETTOKEN&hint=jane%40example.com' },
  });
  assert.equal(out.message, 'Invite for [email] was refused');
  assert.equal(out.context.path, '/');
});

test('long and odd values are trimmed rather than trusted', () => {
  const out = sanitizeReport({
    kind: 'auth_email',
    code: 'auth/<script>'.repeat(20),
    message: 'x'.repeat(5000),
    ref: 'not a ref!',
    fn: 'a'.repeat(100),
    context: { platform: 'windows-phone', method: 'carrier-pigeon', inApp: 'y'.repeat(50), standalone: 'yes', extra: 'dropped' },
  });
  assert.ok(out.code.length <= 80);
  assert.match(out.code, /^[a-z0-9/_.-]*$/i);
  assert.equal(out.message.length, 300);
  assert.equal(out.ref, null);
  assert.ok(out.fn.length <= 40);
  assert.deepStrictEqual(out.context, { inApp: 'y'.repeat(20) });
});
