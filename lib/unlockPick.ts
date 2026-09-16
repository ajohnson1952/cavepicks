// lib/unlockPick.ts
// The single "undo a lock" payload - wipes the frozen line/odds and any
// grading so the pick goes back to unlocked-but-still-selected, exactly as
// if Lock In had never been clicked. Shared by the single-pick admin
// unlock and the bulk "unlock stale locks" tool so they can't drift apart.
export const UNLOCK_DATA = {
  locked: false,
  lockedAt: null,
  lockedLine: null,
  lockedOdds: null,
  dogSpreadValue: null,
  lockedBook: null,
  graded: false,
  isWin: null,
  isPush: null,
  pointsEarned: 0,
} as const;
