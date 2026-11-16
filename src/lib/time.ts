/**
 * When a record happened.
 *
 * Records written by Cloud Functions (completions, raffle entries, audit
 * entries) store `timestamp` as a Firestore Timestamp, with an ISO copy in
 * `timestampIso`. Records written by the browser store an ISO string in
 * `timestamp`. `new Date(timestamp)` only works for the second kind: for the
 * first it gave "Invalid Date", so a business saw every visit as "Invalid
 * date" and "Visitors Today" stayed at 0.
 */
export interface Timed {
  timestamp?: unknown;
  timestampIso?: unknown;
}

const valid = (d: Date) => (Number.isNaN(d.getTime()) ? null : d);

export function whenOf(rec: Timed | null | undefined): Date | null {
  if (!rec) return null;
  if (typeof rec.timestampIso === 'string') {
    const d = valid(new Date(rec.timestampIso));
    if (d) return d;
  }
  const ts = rec.timestamp as { toDate?: () => Date; seconds?: number } | string | number | null | undefined;
  if (ts && typeof ts === 'object') {
    if (typeof ts.toDate === 'function') return valid(ts.toDate());
    if (typeof ts.seconds === 'number') return valid(new Date(ts.seconds * 1000));
    return null;
  }
  if (typeof ts === 'string' || typeof ts === 'number') return valid(new Date(ts));
  return null;
}

/** Milliseconds for sorting; records with no usable time sort last. */
export const whenMs = (rec: Timed | null | undefined) => whenOf(rec)?.getTime() ?? 0;

export function formatWhen(rec: Timed | null | undefined, style: 'datetime' | 'date' = 'datetime'): string {
  const d = whenOf(rec);
  if (!d) return '';
  return style === 'date' ? d.toLocaleDateString() : d.toLocaleString();
}

export function isToday(rec: Timed | null | undefined, now = new Date()): boolean {
  const d = whenOf(rec);
  return !!d && d.toDateString() === now.toDateString();
}
