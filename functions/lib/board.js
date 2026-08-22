const crypto = require('node:crypto');

/**
 * Server-side board generation.
 *
 * Ported from src/services/bingoService.ts. The client copy stays for rendering
 * helpers, but the board itself is now generated here and written to
 * boards/{uid}, because a player who can rewrite their own board picks nine
 * businesses in one strip mall and wins before lunch.
 *
 * Keep checkBingo below in sync with the client copy. They are deliberately
 * duplicated rather than shared, because the functions directory has its own
 * package.json and pulling in the TypeScript source would mean a build step.
 */

/** Uniform integer in [0, max) from the CSPRNG, with rejection sampling. */
const randomInt = (max) => {
  if (max <= 0) throw new RangeError('max must be positive');
  if (max === 1) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  let v;
  do {
    v = crypto.randomBytes(4).readUInt32BE(0);
  } while (v >= limit);
  return v % max;
};

/** Unbiased Fisher-Yates. Never `sort(() => 0.5 - Math.random())`. */
const shuffle = (input) => {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Odd boards have a true centre; even boards do not. The original
 * `Math.floor(size * size / 2)` put the free space at the left edge of row 2 on
 * a 4x4 board. Board size is admin-adjustable, so this case is reachable.
 */
const freeSpaceIndex = (size) => {
  if (size % 2 === 1) {
    const mid = (size - 1) / 2;
    return mid * size + mid;
  }
  const mid = size / 2 - 1;
  return mid * size + mid;
};

const businessesNeededFor = (size) => size * size - 1;

const generateBingoBoard = (businesses, settings, userTown) => {
  const size = settings.boardSize || 3;
  const totalSlots = size * size;
  const freeIdx = freeSpaceIndex(size);
  const difficulty = typeof settings.difficulty === 'number' ? settings.difficulty : 50;

  const localBiz = businesses.filter(b => b.town === userTown);
  const otherBiz = businesses.filter(b => b.town !== userTown);

  const slotsToFill = totalSlots - 1;

  let targetOtherCount = Math.floor(slotsToFill * (difficulty / 100));
  let targetLocalCount = slotsToFill - targetOtherCount;

  if (localBiz.length < targetLocalCount) {
    targetLocalCount = localBiz.length;
    targetOtherCount = slotsToFill - targetLocalCount;
  }
  if (otherBiz.length < targetOtherCount) {
    targetOtherCount = otherBiz.length;
    targetLocalCount = Math.min(localBiz.length, slotsToFill - targetOtherCount);
  }

  const selectedLocal = shuffle(localBiz).slice(0, targetLocalCount);
  const selectedOther = shuffle(otherBiz).slice(0, targetOtherCount);
  const pool = shuffle([...selectedLocal, ...selectedOther]);

  const board = [];
  for (let i = 0; i < totalSlots; i++) {
    if (i === freeIdx) board.push('FREE');
    else {
      const biz = pool.pop();
      board.push(biz ? biz.id : 'EMPTY');
    }
  }
  return board;
};

/** Row / column / diagonal check. FREE counts as filled. */
const checkBingo = (board, completedBusinessIds, size) => {
  if (!Array.isArray(board) || board.length === 0 || size <= 0) return false;
  if (board.length !== size * size) return false;

  const done = new Set(completedBusinessIds);
  const filled = (cell) => cell === 'FREE' || done.has(cell);

  const grid = [];
  for (let i = 0; i < board.length; i += size) grid.push(board.slice(i, i + size));

  for (let r = 0; r < size; r++) if (grid[r].every(filled)) return true;
  for (let c = 0; c < size; c++) if (grid.every(row => filled(row[c]))) return true;
  if (grid.every((row, i) => filled(row[i]))) return true;
  if (grid.every((row, i) => filled(row[size - 1 - i]))) return true;
  return false;
};

module.exports = {
  randomInt, shuffle, freeSpaceIndex, businessesNeededFor,
  generateBingoBoard, checkBingo,
};
