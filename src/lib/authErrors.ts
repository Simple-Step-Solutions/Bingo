/**
 * Player-facing text for Firebase Auth failures.
 *
 * The raw message ("Firebase: Error (auth/popup-blocked).") means nothing to a
 * shopper standing in a store. The code itself is still shown underneath, small,
 * along with a reference, so a screenshot sent to the Chamber tells us exactly
 * what happened.
 */

const MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google sign-in pop-up. Allow pop-ups for this site, or sign in with email instead.',
  'auth/network-request-failed': 'Could not reach Google. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/user-disabled': 'This account has been turned off. Contact the Chamber for help.',
  'auth/unauthorized-domain': 'Google sign-in is not set up for this address. Please let the Chamber know.',
  'auth/operation-not-allowed': 'Google sign-in is turned off right now. Please let the Chamber know.',
  'auth/account-exists-with-different-credential': 'This email already has an account with a password. Sign in with email instead.',
  'auth/web-storage-unsupported': 'This browser is blocking the storage sign-in needs. Try Safari or Chrome, and turn off private browsing.',
  'auth/operation-not-supported-in-this-environment': 'Google sign-in does not work in this browser. Open the page in Safari or Chrome.',
  'auth/internal-error': 'Google sign-in hit a problem. Try again, or sign in with email instead.',
};

/** Codes that mean the player backed out. Nothing to show. */
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

/**
 * Failures a full-page redirect can get past: the popup itself could not open
 * or could not talk back to the page.
 */
const REDIRECT_FIXES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

export const friendlyAuthError = (code: string | undefined): string | null => {
  if (code && SILENT.has(code)) return null;
  return (code && MESSAGES[code]) || 'Google sign-in did not finish. Please try again, or sign in with email instead.';
};

export const shouldRetryWithRedirect = (code: string | undefined): boolean =>
  Boolean(code && REDIRECT_FIXES.has(code));
