/**
 * Pure helpers for the chamber's business spreadsheet. No Firebase and no
 * network here, so every rule below is unit tested against the problems the
 * chamber's real Round 1 sheet actually had.
 *
 * The sheet's columns (order does not matter, header case and spacing do not
 * matter):
 *
 *   name, address, town, task, website, contact_email, login_email, phone,
 *   category, description, image, nfcId
 *
 * contact_email is public and shown to players. login_email is private: it is
 * the address the owner signs up with, and it never goes on the public
 * business document. A plain `email` column fills both, so older sheets work.
 */

export interface ImportRow {
  /** Spreadsheet line number, counting the header as line 1. */
  line: number;
  name: string;
  address: string;
  town: string;
  task: string;
  website: string;
  contactEmail: string;
  loginEmail: string;
  phone: string;
  category: string;
  description: string;
  image: string;
  nfcId: string;
  /** No storefront, so no map pin and no distance check. */
  online: boolean;
}

export interface RowIssue {
  line: number;
  name: string;
  message: string;
}

/**
 * Excel's default "CSV (Comma delimited)" saves Windows-1252, which PapaParse
 * reads as UTF-8 and turns "Café" into "Caf\uFFFD". Try strict UTF-8 first and
 * fall back, so either kind of save works.
 */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text.replace(/^\uFEFF/, '');
}

/** Non-breaking and zero-width spaces come in from copy and paste. */
export function cleanText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\s]+/g, ' ')
    .trim();
}

export function normalizeHeader(header: string): string {
  return cleanText(header).toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * The pop-out links the website as is, so "www.shop.com" became a relative
 * link that went nowhere. Anything that is not an http(s) link is dropped.
 */
export function normalizeWebsite(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname.includes('.') || /\s/.test(raw)) return '';
    // URL lowercases the host and adds a trailing slash to a bare origin.
    // Keep what was typed when it already had a scheme.
    if (/^https?:\/\//i.test(raw)) return raw;
    return url.pathname === '/' && !raw.endsWith('/') ? url.origin : url.href;
  } catch {
    return '';
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** '' when blank, null when present but not an email address. */
export function normalizeEmail(value: unknown): string | null {
  const email = cleanText(value).toLowerCase();
  if (!email) return '';
  return EMAIL.test(email) ? email : null;
}

export function isOnlineAddress(value: unknown): boolean {
  return /^(online|online only|virtual|web|website)$/i.test(cleanText(value));
}

const STATE_ZIP = /\b([A-Z]{2})\s*,?\s*(\d{5})(?:-\d{4})?\s*$/;

/**
 * Addresses to try, most specific first. The geocoder misses on suite numbers,
 * floors and "Inside the mall," prefixes, which is 8 of the chamber's first
 * 27 rows. The last candidate is just the street plus state and ZIP.
 */
export function addressCandidates(address: string): string[] {
  const original = cleanText(address);
  if (!original) return [];

  const unitless = original
    .replace(/\b(suite|ste|unit|apt|rm|room)\.?\s*#?\s*[\w-]+/gi, '')
    .replace(/#\s*[\w-]+/g, '')
    .replace(/\b\d+(st|nd|rd|th)\s+fl(oor)?\b\.?/gi, '');
  let parts = unitless.split(',').map(p => cleanText(p)).filter(Boolean);
  const firstStreet = parts.findIndex(p => /^\d/.test(p));
  if (firstStreet > 0) parts = parts.slice(firstStreet);
  const stripped = parts.join(', ');

  const candidates = [original, stripped];

  const stateZip = original.match(STATE_ZIP);
  if (stateZip && firstStreet >= 0) {
    candidates.push(`${parts[0]}, ${stateZip[1]} ${stateZip[2]}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

interface GeocoderResult {
  lat: string;
  lon: string;
  address?: { house_number?: string; postcode?: string };
}

/**
 * Whether to trust a geocoder hit. A wrong pin is worse than none: the
 * geofence is 500 m, so a pin on the wrong street makes the square impossible
 * to verify. A business with no pin is reported to the chamber instead.
 *
 * - The ZIP in the query must agree with the result. Without this,
 *   "16 Franciscan Way" in Garrison resolved to New Jersey.
 * - A simplified (fallback) query must land on the house itself. A street
 *   centroid for the Jefferson Valley Mall was about 850 m from the shop.
 */
export function acceptMatch(
  result: GeocoderResult | undefined,
  query: string,
  fallback: boolean,
): { lat: number; lng: number } | null {
  if (!result) return null;
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const zip = query.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  const resultZip = result.address?.postcode?.slice(0, 5);
  if (zip && resultZip && zip !== resultZip) return null;
  if (fallback && !result.address?.house_number) return null;

  return { lat, lng };
}

/** Existing town spelled however the sheet spelled it, or null if new. */
export function matchTown(town: string, existing: string[]): string | null {
  const key = (s: string) => cleanText(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = key(town);
  return existing.find(t => key(t) === wanted) ?? null;
}

type RawRecord = Record<string, unknown>;

export function rowsFromRecords(records: RawRecord[]): { rows: ImportRow[]; issues: RowIssue[] } {
  const rows: ImportRow[] = [];
  const issues: RowIssue[] = [];

  records.forEach((rec, i) => {
    const line = i + 2;
    const get = (key: string) => cleanText(rec[key]);
    const name = get('name');
    const issue = (message: string) => issues.push({ line, name, message });

    if (!name) {
      // A row with only stray cells is not worth reporting.
      if (Object.values(rec).some(v => cleanText(v))) issue('No business name, so this row was skipped.');
      return;
    }

    const email = (column: string, fallback: string) => {
      const raw = get(column) || get(fallback);
      const value = normalizeEmail(raw);
      if (value === null) {
        issue(`${get(column) ? column : fallback} "${raw}" is not an email address, so it was left blank.`);
        return '';
      }
      return value;
    };

    const rawWebsite = get('website');
    const website = normalizeWebsite(rawWebsite);
    if (rawWebsite && !website) issue(`website "${rawWebsite}" is not a web address, so it was left blank.`);

    const base = {
      line,
      task: get('task'),
      website,
      contactEmail: email('contact_email', 'email'),
      loginEmail: email('login_email', 'email'),
      phone: get('phone'),
      category: get('category'),
      description: get('description'),
      image: get('image'),
      nfcId: get('nfcid'),
    };

    const rawAddress = get('address');
    const online = isOnlineAddress(rawAddress);
    const addresses = online ? [''] : rawAddress.split(';').map(cleanText);
    const towns = get('town').split(';').map(cleanText);

    // "Two shops in one row": one business per location, each with its own
    // code, named by town so the QR download does not get two identical names.
    if (addresses.length > 1) {
      if (towns.length !== addresses.length) {
        issue(`Has ${addresses.length} addresses but ${towns.length} towns. Put each location on its own row.`);
        return;
      }
      if (base.nfcId) issue('An NFC tag can only belong to one location, so it was left off both.');
      addresses.forEach((address, n) => rows.push({
        ...base, nfcId: '', name: `${name} (${towns[n]})`, address, town: towns[n], online: false,
      }));
      return;
    }

    const town = towns.join(' ');
    if (!town && !online) issue('No town. It will only appear as an out-of-town square.');
    if (!rawAddress) issue('No address, so it has no map pin and no distance check.');

    rows.push({ ...base, name, address: online ? '' : rawAddress, town, online });
  });

  return { rows, issues };
}
