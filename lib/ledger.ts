// Weekly-pot money ledger for /pot. Everything is NET: a player's $25
// buy-in is charged each week, and anything they win that week is credited
// against it - so a $68 tie share shows up as +$43, and only the difference
// ever actually changes hands. Payments recorded on /admin (the Payment
// table) settle it. Weeks before TIE_SPLIT_START_WEEK were settled outside
// the app under the old rules and aren't part of this ledger at all.
import { prisma } from "./db";
import { TIE_SPLIT_START_WEEK, WEEKLY_BUYIN } from "./pot";
import { computeCurrentSeasonStats, WeekResult } from "./seasonStats";

export type LedgerWeekLine = {
  weekNumber: number;
  inProgress: boolean;
  buyIn: number;
  won: number;
  net: number; // won - buyIn
};

export type LedgerPlayer = {
  userId: string;
  name: string;
  weeks: LedgerWeekLine[];
  netFromWeeks: number;
  paidIn: number; // player -> bank
  paidOut: number; // bank -> player
  // positive = the bank owes this player; negative = they owe the bank
  balance: number;
};

export async function computeLedger(seasonYear: number) {
  const { users, weekResults, currentWeekNumber } = await computeCurrentSeasonStats(seasonYear);
  const ledgerWeeks: WeekResult[] = weekResults.filter((w) => w.weekNumber >= TIE_SPLIT_START_WEEK);

  const payments = await prisma.payment.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  const players: LedgerPlayer[] = users.map((u) => {
    const weeks = ledgerWeeks.map((w) => {
      const won = w.payouts.find((p) => p.name === u.name)?.amount ?? 0;
      return { weekNumber: w.weekNumber, inProgress: w.inProgress, buyIn: WEEKLY_BUYIN, won, net: won - WEEKLY_BUYIN };
    });
    const netFromWeeks = weeks.reduce((a, w) => a + w.net, 0);
    const mine = payments.filter((p) => p.userId === u.id);
    const paidIn = mine.filter((p) => p.direction === "in").reduce((a, p) => a + p.amount, 0);
    const paidOut = mine.filter((p) => p.direction === "out").reduce((a, p) => a + p.amount, 0);
    return {
      userId: u.id,
      name: u.name,
      weeks,
      netFromWeeks,
      paidIn,
      paidOut,
      balance: netFromWeeks + paidIn - paidOut,
    };
  });

  // Rounding the bank has kept since the ledger started (goes toward hosting).
  const houseTotal = ledgerWeeks.reduce((a, w) => a + w.houseCut, 0);

  return { players, payments, ledgerWeeks, weekResults, currentWeekNumber, houseTotal, userCount: users.length };
}
