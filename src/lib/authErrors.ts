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

export type EmailAuthMode = 'signin' | 'signup';

export interface EmailAuthError {
  text: string;
  /** The other form, when that is almost certainly what the player needs. */
  switchTo?: 'email-signin' | 'email-signup';
}

/**
 * With email enumeration protection on, Firebase answers a sign-in for an email
 * that has no account with the same auth/invalid-credential as a wrong
 * password. During launch nearly every one of those is a new player who pressed
 * Sign In, so the message leads with creating an account.
 */
const NO_MATCH = new Set(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials']);

export const emailAuthError = (code: string | undefined, mode: EmailAuthMode): EmailAuthError => {
  if (mode === 'signin' && code && NO_MATCH.has(code)) {
    return {
      text: 'That email and password do not match an account. New to Chamber Bingo? Create an account first.',
      switchTo: 'email-signup',
    };
  }
  switch (code) {
    case 'auth/email-already-in-use':
      return { text: 'This email already has an account. Sign in instead.', switchTo: 'email-signin' };
    case 'auth/weak-password':
      return { text: 'Pick a password of at least 6 characters.' };
    case 'auth/invalid-email':
      return { text: 'That email address does not look right. Check it and try again.' };
    case 'auth/too-many-requests':
      return { text: 'Too many attempts. Wait a few minutes and try again.' };
    case 'auth/network-request-failed':
      return { text: 'Could not connect. Check your signal and try again.' };
    case 'auth/user-disabled':
      return { text: 'This account has been turned off. Contact the Chamber for help.' };
    default:
      return { text: mode === 'signup' ? 'Could not create your account. Please try again.' : 'Could not sign you in. Please try again.' };
  }
};
