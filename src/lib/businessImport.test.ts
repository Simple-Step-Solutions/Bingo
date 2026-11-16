import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCsvBytes,
  cleanText,
  normalizeWebsite,
  normalizeEmail,
  isOnlineAddress,
  addressCandidates,
  acceptMatch,
  normalizeHeader,
  rowsFromRecords,
  matchTown,
} from './businessImport';

const bytes = (...b: number[]) => new Uint8Array(b).buffer;

test('decodes UTF-8 and strips a BOM', () => {
  const buf = new TextEncoder().encode('\uFEFFname\nBeanRunner Café').buffer as ArrayBuffer;
  assert.equal(decodeCsvBytes(buf), 'name\nBeanRunner Café');
});

test('falls back to Windows-1252, which is what Excel "CSV (Comma delimited)" saves', () => {
  // "Caf\xe9", "St. Christopher\x92s", and a non-breaking space
  assert.equal(decodeCsvBytes(bytes(0x43, 0x61, 0x66, 0xe9)), 'Café');
  assert.equal(decodeCsvBytes(bytes(0x73, 0x92, 0x73)), 's\u2019s');
  assert.equal(decodeCsvBytes(bytes(0x61, 0xa0, 0x62)), 'a\u00A0b');
});

test('cleanText removes non-breaking and zero-width spaces and trims', () => {
  assert.equal(cleanText('\u00A0mrose@sportimepickleball.com\u00A0'), 'mrose@sportimepickleball.com');
  assert.equal(cleanText('Cindys\u00A0Kitchen'), 'Cindys Kitchen');
  assert.equal(cleanText('a\u200B  b '), 'a b');
  assert.equal(cleanText(undefined), '');
});

test('normalizeWebsite adds https to bare domains and leaves full URLs alone', () => {
  assert.equal(normalizeWebsite('www.flatirongallerypeekskill.com'), 'https://www.flatirongallerypeekskill.com');
  assert.equal(normalizeWebsite('bakedbysusan.com'), 'https://bakedbysusan.com');
  assert.equal(normalizeWebsite('WWW.EASTCOASTSPORTSANDFITNESS.COM'), 'https://www.eastcoastsportsandfitness.com');
  assert.equal(normalizeWebsite('https://www.necspace.org/'), 'https://www.necspace.org/');
  assert.equal(normalizeWebsite('http://example.com/Path'), 'http://example.com/Path');
  assert.equal(normalizeWebsite(''), '');
  // Anything that is not a web link is dropped rather than rendered as a link.
  assert.equal(normalizeWebsite('javascript:alert(1)'), '');
  assert.equal(normalizeWebsite('not a website'), '');
});

test('normalizeEmail cleans, lowercases, and rejects junk', () => {
  assert.equal(normalizeEmail('SCICommunications@atonementfriars.org\u00A0'), 'scicommunications@atonementfriars.org');
  assert.equal(normalizeEmail('Info@peekskillcoffee.com'), 'info@peekskillcoffee.com');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail('not an email'), null);
});

test('isOnlineAddress', () => {
  assert.equal(isOnlineAddress('ONLINE'), true);
  assert.equal(isOnlineAddress(' online only '), true);
  assert.equal(isOnlineAddress('1 Windsor Road, Yorktown Heights, NY 10598'), false);
});

test('addressCandidates: as written, then without suite and floor details, then street plus state and ZIP', () => {
  assert.deepEqual(addressCandidates('1000 N Division St Ste 21, Peekskill, NY 10566'), [
    '1000 N Division St Ste 21, Peekskill, NY 10566',
    '1000 N Division St, Peekskill, NY 10566',
    '1000 N Division St, NY 10566',
  ]);
  assert.deepEqual(addressCandidates('1000 N. Division Street, The Hat Factory, Suite #13A, Peekskill, NY 10566'), [
    '1000 N. Division Street, The Hat Factory, Suite #13A, Peekskill, NY 10566',
    '1000 N. Division Street, The Hat Factory, Peekskill, NY 10566',
    '1000 N. Division Street, NY 10566',
  ]);
  assert.deepEqual(addressCandidates('105 South Division Street, 2nd floor Peekskill, NY 10566')[1],
    '105 South Division Street, Peekskill, NY 10566');
  assert.deepEqual(addressCandidates('Inside the Jefferson Valley Mall, 600 Lee Blvd, Yorktown Heights, NY, 10598'), [
    'Inside the Jefferson Valley Mall, 600 Lee Blvd, Yorktown Heights, NY, 10598',
    '600 Lee Blvd, Yorktown Heights, NY, 10598',
    '600 Lee Blvd, NY 10598',
  ]);
  assert.deepEqual(addressCandidates('2050 E Main St Ste 2F-2, Cortlandt Manor, NY 10567')[1],
    '2050 E Main St, Cortlandt Manor, NY 10567');
  // Nothing to strip, so no duplicate of the original.
  assert.deepEqual(addressCandidates('241 Welcher Ave, Peekskill, NY 10566'), [
    '241 Welcher Ave, Peekskill, NY 10566',
    '241 Welcher Ave, NY 10566',
  ]);
  // No state: a bare ZIP is not enough to keep the lookup in New York.
  assert.deepEqual(addressCandidates('201 Veterans Road, Yorktown Heights, 10598'), ['201 Veterans Road, Yorktown Heights, 10598']);
});

test('acceptMatch: a fallback lookup must land on the house, in the right ZIP', () => {
  const house = { lat: '41.3', lon: '-73.9', address: { house_number: '1000', postcode: '10566' } };
  const street = { lat: '41.3', lon: '-73.8', address: { postcode: '10598' } };
  const newJersey = { lat: '40.9', lon: '-74.1', address: { house_number: '16', postcode: '07410' } };

  assert.deepEqual(acceptMatch(house, '1000 N Division St, NY 10566', true), { lat: 41.3, lng: -73.9 });
  // A street centroid can be most of a kilometre from the shop: outside the geofence.
  assert.equal(acceptMatch(street, '600 Lee Blvd, NY 10598', true), null);
  assert.equal(acceptMatch(newJersey, '16 Franciscan Way, NY 10524', false), null);
  // The address as written is trusted as before, unless the ZIP disagrees.
  assert.deepEqual(acceptMatch(street, '600 Lee Blvd, Yorktown Heights, NY 10598', false), { lat: 41.3, lng: -73.8 });
  assert.equal(acceptMatch(undefined, 'x', false), null);
});

test('normalizeHeader', () => {
  assert.equal(normalizeHeader(' Login Email '), 'login_email');
  assert.equal(normalizeHeader('\uFEFFName'), 'name');
  assert.equal(normalizeHeader('contact_email'), 'contact_email');
});

const julia = {
  name: 'Peekskill Coffee House',
  address: '101 S Division St. Peekskill, NY 10566',
  town: 'Peekskill',
  task: 'Order a drink from Peekskill Coffee House.',
  website: 'https://www.peekskillcoffee.com/',
  contact_email: 'Info@peekskillcoffee.com',
  login_email: 'Brie@peekskillcoffee.com',
  phone: '914-739-1287',
  category: 'Restaurant',
  description: 'Coffee.\u00A0',
  image: 'https://example.com/a.jpg',
};

test('rowsFromRecords maps every column of the chamber sheet', () => {
  const { rows, issues } = rowsFromRecords([julia]);
  assert.deepEqual(issues, []);
  assert.deepEqual(rows, [{
    line: 2,
    name: 'Peekskill Coffee House',
    address: '101 S Division St. Peekskill, NY 10566',
    town: 'Peekskill',
    task: 'Order a drink from Peekskill Coffee House.',
    website: 'https://www.peekskillcoffee.com/',
    contactEmail: 'info@peekskillcoffee.com',
    loginEmail: 'brie@peekskillcoffee.com',
    phone: '914-739-1287',
    category: 'Restaurant',
    description: 'Coffee.',
    image: 'https://example.com/a.jpg',
    nfcId: '',
    online: false,
  }]);
});

test('a plain email column fills both emails, so older sheets still work', () => {
  const { rows } = rowsFromRecords([{ name: 'A', town: 'Peekskill', email: 'owner@a.com' }]);
  assert.equal(rows[0].contactEmail, 'owner@a.com');
  assert.equal(rows[0].loginEmail, 'owner@a.com');
});

test('one row with two locations becomes two businesses, named by town', () => {
  const { rows } = rowsFromRecords([{
    name: 'Kings House of Fire',
    address: '3006 E. Main Street Cortlandt Manor, NY 10567; 345 N. Highland\u00A0Ave Ossining, NY 10562',
    town: 'Cortlandt Manor; Ossining',
    login_email: 'info@kingshouseoffire.com',
  }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => [r.name, r.town, r.address]), [
    ['Kings House of Fire (Cortlandt Manor)', 'Cortlandt Manor', '3006 E. Main Street Cortlandt Manor, NY 10567'],
    ['Kings House of Fire (Ossining)', 'Ossining', '345 N. Highland Ave Ossining, NY 10562'],
  ]);
  assert.ok(rows.every(r => r.loginEmail === 'info@kingshouseoffire.com'));
});

test('an online business has no address to look up', () => {
  const { rows } = rowsFromRecords([{ name: 'Cindys Kitchen', address: 'ONLINE', town: '' }]);
  assert.equal(rows[0].online, true);
  assert.equal(rows[0].address, '');
});

test('problems are reported against the spreadsheet line', () => {
  const { rows, issues } = rowsFromRecords([
    julia,
    { name: '', town: 'Peekskill' },
    { name: 'B', town: 'Peekskill', login_email: 'nope', address: '1 Main St' },
    { name: 'C', town: '', address: '1 Main St' },
  ]);
  // B and C still go in, with a warning. Only the nameless row is skipped.
  assert.equal(rows.length, 3);
  assert.deepEqual(issues, [
    { line: 3, name: '', message: 'No business name, so this row was skipped.' },
    { line: 4, name: 'B', message: 'login_email "nope" is not an email address, so it was left blank.' },
    { line: 5, name: 'C', message: 'No town. It will only appear as an out-of-town square.' },
  ]);
});

test('matchTown ignores case, spacing and punctuation', () => {
  const towns = ['Yorktown', 'Croton-on-Hudson', 'Peekskill'];
  assert.equal(matchTown('croton on hudson', towns), 'Croton-on-Hudson');
  assert.equal(matchTown(' PEEKSKILL ', towns), 'Peekskill');
  assert.equal(matchTown('Shrub Oak', towns), null);
});
