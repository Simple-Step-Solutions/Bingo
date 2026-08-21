import { Business, AppSettings, Completion } from "../types";

/**
 * Unbiased Fisher-Yates shuffle.
 *
 * Replaces `arr.sort(() => 0.5 - Math.random())`, which is a well known broken
 * shuffle: the comparator is inconsistent, so the result is neither uniform nor
 * stable across engines. It matters here because board composition decides which
 * member businesses get foot traffic.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Uniform integer in [0, max) using the CSPRNG, with rejection sampling. */
export const randomInt = (max: number): number => {
  if (max <= 0) throw new RangeError('max must be positive');
  if (max === 1) return 0;
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    // Non-browser fallback (SSR, older test runners). Still uniform enough.
    return Math.floor(Math.random() * max);
  }
  // Discard values in the incomplete final bucket so every value is equally likely.
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % max;
};

/**
 * Index of the free space.
 *
 * Odd boards have a true centre. Even boards do not: the old
 * `Math.floor(size * size / 2)` put the free space at index 8 on a 4x4 board,
 * which is row 2 column 0, the left edge. Pick the upper-left centre cell
 * instead so it still sits on the main diagonal.
 */
export const freeSpaceIndex = (size: number): number => {
  if (size % 2 === 1) {
    const mid = (size - 1) / 2;
    return mid * size + mid;
  }
  const mid = size / 2 - 1;
  return mid * size + mid;
};

export const generateBingoBoard = (
  businesses: Business[],
  settings: AppSettings,
  userTown?: string,
) => {
  const size = settings.boardSize || 3;
  const totalSlots = size * size;
  const freeIdx = freeSpaceIndex(size);
  const difficulty = settings.difficulty || 50; // 0-100

  const localBiz = businesses.filter(b => b.town === userTown);
  const otherBiz = businesses.filter(b => b.town !== userTown);

  const board: string[] = [];
  const slotsToFill = totalSlots - 1;

  // difficulty 0   = all local if possible
  // difficulty 100 = all out-of-town if possible
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

  for (let i = 0; i < totalSlots; i++) {
    if (i === freeIdx) {
      board.push('FREE');
    } else {
      const biz = pool.pop();
      board.push(biz ? biz.id : 'EMPTY');
    }
  }

  return board;
};

/** True when the pool was too small to fill every square. */
export const boardIsIncomplete = (board: readonly string[]) => board.includes('EMPTY');

/** How many businesses are needed to fill a board of this size. */
export const businessesNeededFor = (size: number) => size * size - 1;

/**
 * Row / column / diagonal win check. FREE counts as filled.
 *
 * Single source of truth: this logic previously existed three times, in
 * Dashboard, Profile, and Analytics, and had already drifted apart.
 */
export const checkBingo = (
  board: readonly string[] | undefined,
  completions: readonly Pick<Completion, 'businessId'>[],
  size: number,
): boolean => {
  if (!board || board.length === 0 || size <= 0) return false;
  if (board.length !== size * size) return false;

  const done = new Set(completions.map(c => c.businessId));
  const filled = (cell: string) => cell === 'FREE' || done.has(cell);

  const grid: string[][] = [];
  for (let i = 0; i < board.length; i += size) grid.push(board.slice(i, i + size) as string[]);

  for (let r = 0; r < size; r++) {
    if (grid[r].every(filled)) return true;
  }
  for (let c = 0; c < size; c++) {
    if (grid.every(row => filled(row[c]))) return true;
  }
  if (grid.every((row, i) => filled(row[i]))) return true;
  if (grid.every((row, i) => filled(row[size - 1 - i]))) return true;

  return false;
};
