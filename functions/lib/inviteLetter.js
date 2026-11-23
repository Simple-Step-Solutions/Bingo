/**
 * The chamber's launch letter, emailed to each business with its own sign-up
 * link. Pure functions only, so the rendering and the recipient rules are
 * tested without AWS or Firestore.
 *
 * The letter is plain text the chamber edits in the admin panel. It is never
 * treated as HTML: everything is escaped, and the only markup is what this
 * file adds (paragraphs, line breaks, and the link itself). Mail that leaves
 * our domain cannot carry anything a chamber account typed as markup.
 */

const LINK = '{link}';
const BUSINESS = '{business}';

const MAX_LETTER = 10000;
const MAX_SUBJECT = 200;

const DEFAULT_SUBJECT = 'Holiday Bingo: your business sign-up link';

// Julia's launch letter (11/18 email), with step 1 changed to point at the
// link in this email rather than a separate one.
const DEFAULT_LETTER = `Dear Holiday Bingo participants!

Thank you for being part of Holiday Bingo! Starting Wednesday, November 25, shoppers will visit local businesses like yours to complete tasks on their Bingo cards. When they get Bingo, they're entered in the grand prize drawing.

Your personal sign-up link for ${BUSINESS}:
${LINK}

How to access your business account

1. Click your personal sign-up link above. It's unique to your business and works for two weeks.
2. Sign up with the email address this message was sent to. You'll get access right away. If you use a different address, the Chamber will need to approve it first.
3. Questions? Open the attached 'How To' document and make sure you've followed the steps outlined. Otherwise, call 914.737.3600 or email info@hvgatewaychamber.com, and we'll get back to you as soon as possible.

Once you're signed in, you can see check-ins for your business as people play. The attached guide shows each step with screenshots. If you have trouble getting in, reply with your business name and the email address you're using.

What to tell your team
If you welcome players in person, put your two-sided sign near checkout where shoppers can turn it over. After completing your task, players scan the QR code on the side with your business name to check off their square. If a phone won't scan, players can enter your business's backup code. New players can flip the sign over and scan to sign up. The attached 'How To' document provides more detail and includes photo examples of the app. Encourage your team to play themselves!

Before Wednesday, please check that your business name, location, and task are correct. Reply with any changes. If you have a logo or storefront photo you'd like us to feature, send it along!

See you around town!

Julia Miranda-Roach
Marketing & Communications Associate
Hudson Valley Gateway Chamber of Commerce`;

/** Returns an error message for the chamber, or null when the letter is usable. */
const letterProblem = ({ subject, letter }) => {
  if (typeof subject !== 'string' || !subject.trim()) return 'Add a subject line.';
  if (subject.length > MAX_SUBJECT) return 'The subject line is too long.';
  if (/[\r\n]/.test(subject)) return 'The subject line has to be one line.';
  if (typeof letter !== 'string' || !letter.trim()) return 'The letter is empty.';
  if (letter.length > MAX_LETTER) return 'The letter is too long.';
  if (!letter.includes(LINK)) return `Put ${LINK} in the letter where each business's sign-up link should go.`;
  return null;
};

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const SAMPLE_LINK_TEXT = "[Sample: each business's personal sign-up link appears here]";

/**
 * Fill in one business's letter. Returns the plain text and HTML versions.
 * The link is a URL we built, never chamber input, but it is escaped anyway.
 *
 * With no link (the "Send Me a Test" preview) the spot is shown as a marked
 * sample instead of a link, so nobody clicks a dead invite.
 */
const renderLetter = ({ letter, link, businessName }) => {
  const name = businessName || 'your business';
  const linkText = link || SAMPLE_LINK_TEXT;
  // Split on {link} first, so a business name that happens to contain
  // "{link}" is printed as text rather than becoming a second link.
  const text = letter.split(LINK).map((piece) => piece.split(BUSINESS).join(name)).join(linkText);

  const anchor = link
    ? `<a href="${escapeHtml(link)}" style="color:#1695B2;font-weight:bold">${escapeHtml(link)}</a>`
    : `<span style="background:#FFF3E0;color:#CC5500;font-weight:bold;padding:2px 6px;border-radius:4px">${escapeHtml(SAMPLE_LINK_TEXT)}</span>`;
  const paragraphs = letter
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((para) => para
      .split('\n')
      .map((line) => line
        .split(LINK)
        .map((piece) => escapeHtml(piece.split(BUSINESS).join(name)))
        .join(anchor))
      .join('<br>'))
    .map((para) => `<p style="margin:0 0 16px">${para}</p>`)
    .join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">\n${paragraphs}\n</div>`;
  return { text, html };
};

/**
 * Decide who gets an invite.
 *
 *   businesses  [{ id, name, email }]       the public documents
 *   loginEmails { [businessId]: string }    private login emails, preferred
 *   ownedIds    Set of business ids that already have an owner account
 *   sentIds     Set of business ids already emailed successfully
 */
const pickRecipients = ({ businesses, loginEmails, ownedIds, sentIds }) => {
  const send = [];
  const skipped = [];
  for (const biz of businesses) {
    const email = String(loginEmails[biz.id] || biz.email || '').trim().toLowerCase();
    if (ownedIds.has(biz.id)) skipped.push({ id: biz.id, name: biz.name, reason: 'Already has an account' });
    else if (sentIds.has(biz.id)) skipped.push({ id: biz.id, name: biz.name, reason: 'Already emailed' });
    else if (!email) skipped.push({ id: biz.id, name: biz.name, reason: 'No email address' });
    else send.push({ id: biz.id, name: biz.name, email });
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  return { send: send.sort(byName), skipped: skipped.sort(byName) };
};

module.exports = {
  LINK, BUSINESS, DEFAULT_SUBJECT, DEFAULT_LETTER,
  letterProblem, renderLetter, pickRecipients, escapeHtml,
};
