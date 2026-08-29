// lib/pot.ts

export const WEEKLY_BUYIN = 25;
export const DOG_BUYIN = 100;

type SideRecord = { userId: string; correct: number };

// Call this once every game in a week is graded.
// Returns either a single winner + payout amount, or "rollover" if tied,
// so the caller can create/update the WeeklyPot row accordingly.
export function resolveWeeklyPot(
  records: SideRecord[],
  potAmountBeforeThisWeek: number,
  playerCount: number
): { winnerId: string; amount: number } | { rollover: true; newAmount: number } {
  const thisWeeksPot = potAmountBeforeThisWeek + WEEKLY_BUYIN * playerCount;

  const maxCorrect = Math.max(...records.map((r) => r.correct));
  const leaders = records.filter((r) => r.correct === maxCorrect);

  if (leaders.length === 1) {
    return { winnerId: leaders[0].userId, amount: thisWeeksPot };
  }
  // Tie (or nobody has any correct picks tallied) -> no winner, pot carries forward
  return { rollover: true, newAmount: thisWeeksPot };
}

export function dogPotTotal(playerCount: number): number {
  return DOG_BUYIN * playerCount;
}
