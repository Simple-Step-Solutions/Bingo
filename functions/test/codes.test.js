const test = require('node:test');
const assert = require('node:assert');

const { generateCode, normalizeCode, hashCode, codeKey, ALPHABET, CODE_LEN } = require('../lib/codes');
const { freeSpaceIndex, checkBingo, shuffle, generateBingoBoard } = require('../lib/board');
const { distanceMeters, validCoords } = require('../lib/geo');

test('generated codes have the printed shape', () => {
  const code = generateCode();
  assert.match(code, /^HVG(-[0-9A-HJKMNP-TV-Z]{4}){4}$/,
    `unexpected code shape: ${code}`);
});

test('generated codes use only the Crockford alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const body = generateCode().replace(/^HVG-/, '').replace(/-/g, '');
    assert.equal(body.length, CODE_LEN);
    for (const ch of body) {
      assert.ok(ALPHABET.includes(ch), `"${ch}" is not in the alphabet`);
    }
    // The excluded lookalikes must never be generated, or normalizeCode would
    // rewrite a real code into something that hashes differently.
    assert.doesNotMatch(body, /[ILOU]/);
  }
});

test('codes are not repeated', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateCode());
  assert.equal(seen.size, 500);
});

test('a generated code round-trips to a stable key', () => {
  const code = generateCode();
  assert.equal(codeKey(code), codeKey(code));
  assert.equal(codeKey(code), hashCode(normalizeCode(code)));
});

test('normalisation absorbs realistic input variance', () => {
  const code = generateCode();
  const key = codeKey(code);

  const variants = [
    code.toLowerCase(),
    code.replace(/-/g, ''),
    code.replace(/-/g, ' '),
    `  ${code}  `,
    code.replace(/-/g, '—'),          // em dash from a copy-paste
    `https://bingo.simplestepsolutions.com/verify?code=${code}`,
    `https://bingo.simplestepsolutions.com/v/${code}`,
  ];

  for (const v of variants) {
    assert.equal(codeKey(v), key, `variant did not normalise: ${v}`);
  }
});

test('lookalike characters fold to the same key', () => {
  // A player reading a poster types O for 0 and I or L for 1.
  assert.equal(codeKey('HVG-0123-4567-89AB-CDEF'), codeKey('HVG-OI23-4567-89AB-CDEF'));
  assert.equal(codeKey('HVG-0123-4567-89AB-CDEF'), codeKey('HVG-OL23-4567-89AB-CDEF'));
});

test('legacy CHAMBER_ codes survive normalisation unchanged', () => {
  // These are on posters already in the field. They must keep resolving until
  // the posters are reprinted, so normalisation must not mangle the document id
  // (which is mixed case and may contain characters outside the alphabet).
  const legacy = 'CHAMBER_aB3xY9kLm';
  assert.equal(normalizeCode(legacy), 'CHAMBER_AB3XY9KLM');
  assert.equal(codeKey(legacy), codeKey(' chamber_aB3xY9kLm '));
});

test('empty and junk input yields no key rather than a valid one', () => {
  for (const junk of ['', '   ', null, undefined, 42, {}, '---']) {
    assert.equal(codeKey(junk), '', `junk produced a key: ${JSON.stringify(junk)}`);
  }
});

test('free space sits on the diagonal for both odd and even boards', () => {
  assert.equal(freeSpaceIndex(3), 4);   // centre of 3x3
  assert.equal(freeSpaceIndex(5), 12);  // centre of 5x5
  // The bug this replaced: Math.floor(4*4/2) = 8, which is row 2 col 0.
  assert.equal(freeSpaceIndex(4), 5);   // row 1 col 1, on the main diagonal
  for (const size of [3, 4, 5, 6]) {
    const idx = freeSpaceIndex(size);
    const row = Math.floor(idx / size);
    const col = idx % size;
    assert.equal(row, col, `size ${size} free space is off the diagonal`);
  }
});

test('checkBingo finds rows, columns and both diagonals', () => {
  const board = ['a', 'b', 'c', 'd', 'FREE', 'e', 'f', 'g', 'h'];
  assert.equal(checkBingo(board, ['a', 'b', 'c'], 3), true, 'top row');
  assert.equal(checkBingo(board, ['f', 'g', 'h'], 3), true, 'bottom row');
  assert.equal(checkBingo(board, ['a', 'd', 'f'], 3), true, 'left column');
  assert.equal(checkBingo(board, ['a', 'h'], 3), true, 'main diagonal via FREE');
  assert.equal(checkBingo(board, ['c', 'f'], 3), true, 'anti diagonal via FREE');
  assert.equal(checkBingo(board, ['a', 'b'], 3), false, 'partial row is not a win');
  assert.equal(checkBingo(board, [], 3), false, 'FREE alone is not a win');
});

test('checkBingo refuses malformed input instead of guessing', () => {
  assert.equal(checkBingo(undefined, ['a'], 3), false);
  assert.equal(checkBingo([], ['a'], 3), false);
  assert.equal(checkBingo(['a', 'b'], ['a', 'b'], 3), false, 'length must match size squared');
  assert.equal(checkBingo(['a'], ['a'], 0), false);
});

test('shuffle preserves membership', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = shuffle(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  assert.deepEqual(input, Array.from({ length: 50 }, (_, i) => i), 'input was mutated');
});

test('shuffle is not obviously biased', () => {
  // The replaced sort(() => 0.5 - Math.random()) leaves element 0 in place far
  // more often than chance. Assert the first element moves roughly as expected.
  let stayed = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    if (shuffle([0, 1, 2, 3, 4])[0] === 0) stayed += 1;
  }
  const rate = stayed / N;
  assert.ok(rate > 0.14 && rate < 0.26, `first element stayed put ${(rate * 100).toFixed(1)}% of the time`);
});

test('board generation fills every square when the pool is big enough', () => {
  const businesses = Array.from({ length: 30 }, (_, i) => ({
    id: `b${i}`, town: i % 2 === 0 ? 'Peekskill' : 'Cortlandt',
  }));
  const board = generateBingoBoard(businesses, { boardSize: 3, difficulty: 50 }, 'Peekskill');
  assert.equal(board.length, 9);
  assert.equal(board[freeSpaceIndex(3)], 'FREE');
  assert.ok(!board.includes('EMPTY'));
  assert.equal(new Set(board).size, 9, 'a business appeared twice on one board');
});

test('board generation marks squares EMPTY rather than duplicating a business', () => {
  const businesses = [{ id: 'b0', town: 'Peekskill' }, { id: 'b1', town: 'Peekskill' }];
  const board = generateBingoBoard(businesses, { boardSize: 3, difficulty: 0 }, 'Peekskill');
  assert.equal(board.length, 9);
  assert.equal(board.filter(c => c === 'EMPTY').length, 6);
  const real = board.filter(c => c !== 'EMPTY' && c !== 'FREE');
  assert.equal(new Set(real).size, real.length);
});

test('distance is right for a known pair', () => {
  // Peekskill to Cortlandt Manor, roughly 5km apart.
  const d = distanceMeters(41.2901, -73.9204, 41.3115, -73.8846);
  assert.ok(d > 3000 && d < 6000, `got ${d}m`);
  assert.equal(Math.round(distanceMeters(41.29, -73.92, 41.29, -73.92)), 0);
});

test('coordinate validation rejects the uninitialised pair', () => {
  assert.equal(validCoords(41.29, -73.92), true);
  assert.equal(validCoords(0, 0), false, 'null island must not pass');
  assert.equal(validCoords(91, 0), false);
  assert.equal(validCoords(NaN, 1), false);
  assert.equal(validCoords('41.29', -73.92), false);
  assert.equal(validCoords(undefined, undefined), false);
});
