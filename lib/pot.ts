// lib/pot.ts

export const WEEKLY_BUYIN = 25;
export const DOG_BUYIN = 100;

// Season-end Cavedogs payout: NOT winner-take-all - a fixed 3-way split.
// This assumes the standard 7-player group ($700 total pot); if the group
// size changes, this split may need revisiting.
export const DOG_PAYOUTS = { first: 400, second: 200, third: 100 };
