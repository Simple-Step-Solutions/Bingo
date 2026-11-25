/**
 * Validation for problem reports sent by the app (logClientIssue).
 *
 * Sign-in failures happen in the player's browser before they are signed in, so
 * the server never sees them unless the page tells it. This is the shape the
 * page may send. Everything is allow-listed and trimmed: the endpoint is open to
 * people who are not signed in, so it must not become a place to store
 * arbitrary text, and it must never record an email address or an invite token.
 */

const KINDS = new Set([
  'auth_google', // Continue with Google failed
  'auth_email', // email sign in, sign up, reset or verify failed
  'callable', // a Cloud Function call failed (redeemInvite, verifyVisit, ...)
  'install_help', // the install button had to show instructions instead of installing
  'in_app_browser', // the page was opened inside Facebook, Instagram, etc.
]);

const PLATFORMS = new Set(['ios', 'android', 'other']);
const METHODS = new Set(['popup', 'redirect', 'blocked']);
const REASONS = new Set(['ios', 'in_app', 'no_prompt', 'dismissed']);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const token = (v, max) => {
  const s = str(v, 400);
  return s === null ? null : s.replace(/[^a-z0-9/_.-]/gi, '').slice(0, max);
};

const sanitizeContext = (c) => {
  if (!c || typeof c !== 'object') return {};
  const out = {};
  if (PLATFORMS.has(c.platform)) out.platform = c.platform;
  if (METHODS.has(c.method)) out.method = c.method;
  if (REASONS.has(c.reason)) out.reason = c.reason;
  if (typeof c.inApp === 'string' && c.inApp) out.inApp = c.inApp.replace(/[^a-z0-9 ]/gi, '').slice(0, 20);
  if (typeof c.standalone === 'boolean') out.standalone = c.standalone;
  // The path only. The query string carries invite tokens and email hints.
  if (typeof c.path === 'string') out.path = c.path.split(/[?#]/)[0].slice(0, 100);
  return out;
};

/** The cleaned report, or null when it is not one we accept. */
const sanitizeReport = (data) => {
  if (!data || typeof data !== 'object' || !KINDS.has(data.kind)) return null;
  const message = str(data.message, 2000);
  const ref = typeof data.ref === 'string' && /^[A-Z0-9]{6}$/.test(data.ref) ? data.ref : null;
  return {
    kind: data.kind,
    code: token(data.code, 80),
    message: message === null ? null : message.replace(EMAIL, '[email]').slice(0, 300),
    ref,
    fn: token(data.fn, 40),
    context: sanitizeContext(data.context),
  };
};

module.exports = { sanitizeReport, KINDS };
