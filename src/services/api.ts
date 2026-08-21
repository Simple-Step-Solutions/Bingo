import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * Typed wrappers for the Cloud Functions callables.
 *
 * Everything security-relevant now goes through here. The client no longer
 * holds business codes, no longer decides whether a visit counts, and no longer
 * writes its own role.
 */

const call = <Req, Res>(name: string) => {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
};

/**
 * Callable errors arrive as `functions/<code>` with the message we threw
 * server-side. Those messages are written to be shown to a player, so surface
 * them rather than replacing them with a generic string -- "You are 1,240m
 * away" is far more useful than "Verification failed".
 */
export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  const e = err as FunctionsError;
  if (e && typeof e === 'object' && 'code' in e) {
    if (e.code === 'functions/unauthenticated') return 'Please sign in again.';
    if (e.code === 'functions/internal') return fallback;
    if (e.message) return e.message;
  }
  return fallback;
};

/** True when the failure is one the user can fix by moving or waiting. */
export const isExpectedError = (err: unknown): boolean => {
  const code = (err as FunctionsError)?.code;
  return code === 'functions/failed-precondition'
    || code === 'functions/already-exists'
    || code === 'functions/not-found'
    || code === 'functions/permission-denied'
    || code === 'functions/resource-exhausted';
};

// --- Game loop -------------------------------------------------------------

export interface VerifyVisitResult {
  ok: true;
  businessId: string;
  businessName: string;
  distanceM: number | null;
  bingo: boolean;
  completionsCount: number;
}

export const verifyVisit = call<
  { code: string; method: string; lat?: number; lng?: number },
  VerifyVisitResult
>('verifyVisit');

export interface BoardResult {
  created?: boolean;
  cells: string[];
  size: number;
  incomplete: boolean;
}

export const ensureBoard = call<Record<string, never>, BoardResult>('ensureBoard');
export const regenerateBoard = call<{ uid?: string }, BoardResult>('regenerateBoard');

// --- Onboarding and roles --------------------------------------------------

export const peekInvite = call<
  { token: string },
  { valid: boolean; role?: 'player' | 'business' | 'chamber'; businessName?: string | null }
>('peekInvite');

export const redeemInvite = call<
  { token: string },
  { ok: true; role: string; businessId: string | null }
>('redeemInvite');

export const createInvite = call<
  {
    role: 'player' | 'business' | 'chamber';
    businessId?: string;
    businessName?: string;
    emailHint?: string;
  },
  { token: string; expiresAt: string }
>('createInvite');

export const revokeInvite = call<{ inviteId: string }, { ok: true }>('revokeInvite');

export const claimBusiness = call<
  { code: string },
  { ok: true; businessId: string; businessName: string }
>('claimBusiness');

export const bootstrapAdmin = call<Record<string, never>, { ok: true }>('bootstrapAdmin');

export const setUserRole = call<
  { uid: string; role: 'player' | 'business' | 'chamber' | 'admin'; businessId?: string },
  { ok: true; from: string; to: string }
>('setUserRole');

// --- Chamber operations ----------------------------------------------------

export const provisionBusinessCode = call<
  { businessId: string; rotate?: boolean },
  { code: string; created: boolean }
>('provisionBusinessCode');

export const rotateAllCodes = call<
  Record<string, never>,
  { rotated: number; failed: number; results: { businessId: string; name: string; code: string }[] }
>('rotateAllCodes');

export const setBusinessNfc = call<{ businessId: string; nfcId: string | null }, { ok: true }>('setBusinessNfc');

export const adminGrantCompletion = call<
  { userId: string; businessId: string; reason: string },
  { ok: true }
>('adminGrantCompletion');

export const drawRaffleWinner = call<
  Record<string, never>,
  { ok: true; winner: { userId: string; userName: string; userEmail: string }; poolSize: number }
>('drawRaffleWinner');

export const redeemWin = call<{ userId: string; notes?: string }, { ok: true }>('redeemWin');

export const adminResetUser = call<
  { userId: string; type: 'town' | 'progress' | 'board' | 'everything' },
  { ok: true; deletedCompletions: number }
>('adminResetUser');

export const adminGlobalReset = call<
  Record<string, never>,
  { ok: true; users: number; completions: number; boards: number }
>('adminGlobalReset');

export interface SuspicionFlag {
  type: 'impossible_travel' | 'burst' | 'no_app_check' | 'near_geofence_boundary' | 'shared_ip';
  userId?: string;
  kmh?: number;
  from?: string;
  to?: string;
  seconds?: number;
  count?: number;
  windowMinutes?: number;
  ip?: string;
  userCount?: number;
  userIds?: string[];
}

export const reviewSuspiciousActivity = call<
  Record<string, never>,
  { flags: SuspicionFlag[]; completionsReviewed: number; playersReviewed: number }
>('reviewSuspiciousActivity');
