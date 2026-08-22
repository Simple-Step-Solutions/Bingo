const crypto = require('node:crypto');

/**
 * Business verification codes.
 *
 * The old scheme was `CHAMBER_<documentId>`, and those document IDs sit in the
 * player's own board array. Every code in the game was therefore derivable from
 * data the player already had, which made the entire verification step
 * decorative. These are random instead.
 *
 * Crockford base32 rather than hex or base64url, because a human reads these
 * off a poster and types them into a phone. It drops I, L, O and U, and decodes
 * the characters people confuse anyway: I and L read as 1, O reads as 0.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const PREFIX = 'HVG';
const GROUPS = 4;
const GROUP_LEN = 4;
const CODE_LEN = GROUPS * GROUP_LEN; // 16 chars of base32 = 80 bits

/** Uniform random base32 string, rejection-sampled so every char is equally likely. */
const randomBase32 = (length) => {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length - out.length);
    for (const b of bytes) {
      if (out.length === length) break;
      // 256 is exactly 8 x 32, so `b % 32` is uniform with no rejection needed.
      // If the alphabet ever changes length this stops being true, hence the
      // guard rather than a bare modulo.
      if (256 % ALPHABET.length !== 0 && b >= Math.floor(256 / ALPHABET.length) * ALPHABET.length) continue;
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
};

/** `HVG-A2K7-QW9Z-M4TR-P8XN` */
const generateCode = () => {
  const raw = randomBase32(CODE_LEN);
  const groups = [];
  for (let i = 0; i < CODE_LEN; i += GROUP_LEN) groups.push(raw.slice(i, i + GROUP_LEN));
  return `${PREFIX}-${groups.join('-')}`;
};

/**
 * Fold a scanned or typed code into its canonical form before hashing.
 *
 * Handles the realistic input variance: lowercase from a keyboard, spaces or
 * missing dashes from someone reading a poster, a full URL from a QR code that
 * was encoded as a link, and the I/L/O confusions Crockford exists to absorb.
 *
 * Legacy CHAMBER_<id> codes are passed through with only case and whitespace
 * normalised, because those are printed on posters that are already in the
 * field and must keep working until they are reprinted.
 */
const normalizeCode = (input) => {
  if (typeof input !== 'string') return '';
  let s = input.trim();

  // A QR code encoded as https://bingo.../verify?code=XXXX or .../v/XXXX
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      s = url.searchParams.get('code') || url.pathname.split('/').filter(Boolean).pop() || s;
    } catch {
      // Not a parseable URL after all; fall through and treat it as a raw code.
    }
  }

  s = s.toUpperCase();

  if (s.startsWith('CHAMBER_')) return s.replace(/\s+/g, '');

  // Strip everything that is not alphanumeric, then fix the lookalikes.
  s = s.replace(/[^A-Z0-9]/g, '');
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  s = s.replace(/[IL]/g, '1').replace(/O/g, '0');

  return s;
};

/**
 * Index key for a code. The plaintext is never stored anywhere queryable, so a
 * read of code_index yields hashes rather than working codes.
 */
const hashCode = (normalized) =>
  crypto.createHash('sha256').update(`chamber-bingo:v1:${normalized}`).digest('hex');

/** Convenience: normalize then hash in one step. */
const codeKey = (input) => {
  const normalized = normalizeCode(input);
  return normalized ? hashCode(normalized) : '';
};

module.exports = {
  ALPHABET, PREFIX, CODE_LEN,
  generateCode, normalizeCode, hashCode, codeKey,
};
