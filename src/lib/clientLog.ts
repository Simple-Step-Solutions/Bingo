import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { currentBrowser } from './browserEnv';

/**
 * Report a problem only the player's browser can see, so it shows up in Cloud
 * Logging (jsonPayload.message="client_issue") instead of vanishing.
 *
 * Returns a short reference straight away. Show it beside the error: when a
 * player sends the Chamber a screenshot, that reference finds the exact log
 * entry (jsonPayload.ref="K7Q2MX").
 *
 * Never throws and never waits. A broken logger must not break sign-in.
 */

export type IssueKind = 'auth_google' | 'auth_email' | 'callable' | 'install_help' | 'in_app_browser';

export interface IssueDetails {
  code?: string;
  message?: string;
  fn?: string;
  method?: 'popup' | 'redirect' | 'blocked' | 'signin' | 'signup';
  reason?: 'ios' | 'in_app' | 'no_prompt' | 'dismissed';
}

// No 0/O or 1/I, so a reference read off a screenshot is unambiguous.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
};

const sent = new Set<string>();
const send = httpsCallable(functions, 'logClientIssue');

export const reportIssue = (kind: IssueKind, details: IssueDetails = {}): string => {
  const ref = newRef();
  // The same failure repeated in one visit is one report.
  const key = `${kind}|${details.fn ?? ''}|${details.code ?? ''}|${details.reason ?? ''}`;
  if (sent.has(key)) return ref;
  sent.add(key);

  try {
    const b = currentBrowser();
    const { code, message, fn, method, reason } = details;
    void send({
      kind,
      ref,
      code,
      message,
      fn,
      context: {
        platform: b.platform,
        inApp: b.inApp ?? undefined,
        standalone: b.standalone,
        path: window.location.pathname,
        method,
        reason,
      },
    }).catch(() => { /* Logging is best effort. */ });
  } catch { /* Logging is best effort. */ }
  return ref;
};

/** Pull a Firebase error's code and message out of whatever was thrown. */
export const errorParts = (err: unknown): { code?: string; message?: string } => {
  const e = err as { code?: unknown; message?: unknown } | null;
  return {
    code: e && typeof e.code === 'string' ? e.code : undefined,
    message: e && typeof e.message === 'string' ? e.message : undefined,
  };
};
