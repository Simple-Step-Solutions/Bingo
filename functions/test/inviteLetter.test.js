const test = require('node:test');
const assert = require('node:assert');

const {
  DEFAULT_SUBJECT, DEFAULT_LETTER, letterProblem, renderLetter, pickRecipients,
} = require('../lib/inviteLetter');

const LINK = 'https://bingo.simplestepsolutions.com/?invite=abc123';

test('the default letter is sendable and has no em dashes', () => {
  assert.equal(letterProblem({ subject: DEFAULT_SUBJECT, letter: DEFAULT_LETTER }), null);
  assert.ok(!DEFAULT_LETTER.includes('—'));
  assert.ok(!DEFAULT_SUBJECT.includes('—'));
});

test('a letter without {link} is refused, since the business would get no way in', () => {
  assert.match(letterProblem({ subject: 'Hi', letter: 'No link here' }), /\{link\}/);
});

test('empty, oversized, or multi-line subjects are refused', () => {
  assert.ok(letterProblem({ subject: '  ', letter: '{link}' }));
  assert.ok(letterProblem({ subject: 'x'.repeat(201), letter: '{link}' }));
  assert.ok(letterProblem({ subject: 'Hi\nBcc: someone@example.com', letter: '{link}' }));
  assert.ok(letterProblem({ subject: 'Hi', letter: '' }));
});

test('the link and business name are filled into both versions', () => {
  const { text, html } = renderLetter({ letter: 'Hello {business}!\n{link}', link: LINK, businessName: 'Mondays' });
  assert.equal(text, `Hello Mondays!\n${LINK}`);
  assert.ok(html.includes(`<a href="${LINK}"`));
  assert.ok(html.includes('Hello Mondays!<br>'));
});

test('chamber text is escaped, never sent as markup', () => {
  const { html } = renderLetter({
    letter: '<script>alert(1)</script> & <a href="http://evil">click</a>\n{link}',
    link: LINK,
    businessName: 'Ben & Jerry\'s <b>',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="http://evil"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('a business name containing {link} cannot inject a second link', () => {
  const { text, html } = renderLetter({ letter: '{business} {link}', link: LINK, businessName: '{link}' });
  assert.equal(html.split('<a href=').length - 1, 1);
  assert.equal(text, `{link} ${LINK}`);
});

test('the test preview shows a marked sample instead of a link', () => {
  const { text, html } = renderLetter({ letter: 'For {business}:\n{link}', link: null, businessName: 'Sample Business' });
  assert.ok(text.startsWith('For Sample Business:\n[Sample:'));
  assert.ok(!html.includes('<a '));
  assert.ok(!text.includes('http'));
  assert.ok(html.includes('appears here]'));
});

test('blank lines become paragraphs', () => {
  const { html } = renderLetter({ letter: 'One\n\nTwo\r\n\r\n{link}', link: LINK, businessName: 'X' });
  assert.equal((html.match(/<p /g) || []).length, 3);
});

test('recipients prefer the private login email, and skips are explained', () => {
  const { send, skipped } = pickRecipients({
    businesses: [
      { id: 'a', name: 'Angelface', email: 'info@angelface.com' },
      { id: 'b', name: 'Boho', email: 'Boho@AOL.com' },
      { id: 'g', name: 'Glow Honey', email: '' },
      { id: 'm', name: 'Mondays', email: 'm@x.com' },
      { id: 's', name: 'Smoothie', email: 's@x.com' },
    ],
    loginEmails: { a: 'lee@gmail.com', g: '' },
    ownedIds: new Set(['m']),
    sentIds: new Set(['s']),
  });
  assert.deepEqual(send, [
    { id: 'a', name: 'Angelface', email: 'lee@gmail.com' },
    { id: 'b', name: 'Boho', email: 'boho@aol.com' },
  ]);
  assert.deepEqual(skipped.map((s) => [s.id, s.reason]), [
    ['g', 'No email address'],
    ['m', 'Already has an account'],
    ['s', 'Already emailed'],
  ]);
});
