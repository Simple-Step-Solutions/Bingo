/**
 * Business login emails, checked server-side because the address decides who
 * an invite lets in. Copy and paste from a spreadsheet brings non-breaking and
 * zero-width spaces with it, and an address carrying one never matches the
 * owner's real sign-in.
 *
 * Returns the lowercased address, null to clear it, or undefined when the
 * value is not an email address at all.
 */
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

const normalizeLoginEmail = (value) => {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 254) return undefined;
  const email = value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\s]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!email) return null;
  return EMAIL.test(email) ? email : undefined;
};

module.exports = { normalizeLoginEmail };
