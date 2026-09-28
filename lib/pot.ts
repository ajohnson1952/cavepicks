// lib/pot.ts

export const WEEKLY_BUYIN = 25;
export const DOG_BUYIN = 100;

// Season-end Cavedogs payout: NOT winner-take-all - a 3-way split. The base
// split is $400/$200/$100 (a 7-player, $700 pot); anything the pot holds
// beyond $700 is split evenly between 1st and 2nd (league's call, Sep 2026).
// 3rd stays $100. Whole dollars, rounded down; any odd dollar goes to 1st.
export function dogPayouts(playerCount: number) {
  const total = DOG_BUYIN * playerCount;
  const extra = Math.max(0, total - 700);
  const half = Math.floor(extra / 2);
  return { total, first: 400 + (extra - half), second: 200 + half, third: 100 };
}

// Who holds the weekly pot money - everyone settles up with this person.
// Must match the banker's name in the User table (any single word of it) -
// the banker is left out of balances since they can't owe themselves.
export const BANKER_NAME = "Johnson";
export const isBanker = (name: string) =>
  name.toLowerCase().split(/\s+/).includes(BANKER_NAME.toLowerCase());

// Weekly-pot tie rule changed starting this week (2026 season). Before it, a
// tie rolled the whole pot. From this week on, a tie splits half of THAT
// week's buy-ins among the tied players and rolls the other half - money
// already rolling over is never split, only a solo winner takes it. Weeks
// before this one keep their original results.
export const TIE_SPLIT_START_WEEK = 4;

export type WeekPotResolution = {
  // name -> dollars paid out this week (gross, before their own buy-in)
  payouts: { name: string; amount: number }[];
  carryOut: number; // rolls into next week
  houseCut: number; // rounding cents the bank keeps (goes toward hosting)
};

// Pure pot math for one fully graded week. Everything rounds DOWN to whole
// dollars; whatever that leaves over is the bank's (houseCut) rather than
// rolling, per the league's call.
export function resolveWeekPot(opts: {
  weekNumber: number;
  carryIn: number;
  buyIns: number;
  leaders: string[]; // everyone tied for the most correct picks
  maxCorrect: number;
}): WeekPotResolution {
  const { weekNumber, carryIn, buyIns, leaders, maxCorrect } = opts;
  const pot = carryIn + buyIns;

  // Nobody got a single pick right: no one to pay, everything rolls.
  if (maxCorrect <= 0 || leaders.length === 0) return { payouts: [], carryOut: pot, houseCut: 0 };

  if (leaders.length === 1) return { payouts: [{ name: leaders[0], amount: pot }], carryOut: 0, houseCut: 0 };

  if (weekNumber < TIE_SPLIT_START_WEEK) return { payouts: [], carryOut: pot, houseCut: 0 };

  const half = buyIns / 2;
  const each = Math.floor(half / leaders.length);
  const rolled = Math.floor(half);
  const houseCut = buyIns - each * leaders.length - rolled;
  return {
    payouts: leaders.map((name) => ({ name, amount: each })),
    carryOut: carryIn + rolled,
    houseCut,
  };
}
