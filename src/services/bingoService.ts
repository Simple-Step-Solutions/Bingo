import { Business, AppSettings } from "../types";

export const generateBingoBoard = (businesses: Business[], settings: AppSettings, userTown?: string) => {
  const size = settings.boardSize || 3;
  const totalSlots = size * size;
  const freeSpaceIdx = Math.floor(totalSlots / 2);
  const difficulty = settings.difficulty || 50; // 0-100

  // Filter businesses
  const localBiz = businesses.filter(b => b.town === userTown);
  const otherBiz = businesses.filter(b => b.town !== userTown);

  const board: string[] = [];
  const slotsToFill = totalSlots - 1;
  
  // Calculate how many local vs other based on difficulty
  // difficulty 0 = all local if possible
  // difficulty 100 = all other if possible
  let targetOtherCount = Math.floor(slotsToFill * (difficulty / 100));
  let targetLocalCount = slotsToFill - targetOtherCount;

  // Adjust if not enough businesses
  if (localBiz.length < targetLocalCount) {
    targetLocalCount = localBiz.length;
    targetOtherCount = slotsToFill - targetLocalCount;
  }
  if (otherBiz.length < targetOtherCount) {
    targetOtherCount = otherBiz.length;
    targetLocalCount = slotsToFill - targetOtherCount;
  }

  // Pick randoms
  const selectedLocal = [...localBiz].sort(() => 0.5 - Math.random()).slice(0, targetLocalCount);
  const selectedOther = [...otherBiz].sort(() => 0.5 - Math.random()).slice(0, targetOtherCount);
  
  const pool = [...selectedLocal, ...selectedOther].sort(() => 0.5 - Math.random());

  for (let i = 0; i < totalSlots; i++) {
    if (i === freeSpaceIdx) {
      board.push('FREE');
    } else {
      const biz = pool.pop();
      board.push(biz ? biz.id : 'EMPTY');
    }
  }

  return board;
};
