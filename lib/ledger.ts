// Weekly-pot money ledger for /pot. Everything is NET: a player's $25
// buy-in is charged for each SETTLED week (the league settles up after a
// week ends), and anything they win that week is credited against it - so a $68 tie share shows up as +$43, and only the difference
// ever actually changes hands. Payments recorded on /admin (the Payment
// table) settle it. Weeks before TIE_SPLIT_START_WEEK were settled outside
// the app under the old rules and aren't part of this ledger at all.
import { prisma } from "./db";
import { isBanker, TIE_SPLIT_START_WEEK, WEEKLY_BUYIN } from "./pot";
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
  // The banker also plays. Their money never leaves their pocket, so instead
  // of real Payment rows they get an automatic offsetting entry (bankOffset:
  // + = "bank paid itself in", - = "bank paid itself out") that always zeroes
  // their balance. Any real Payment rows on the banker are ignored.
  isBank: boolean;
  bankOffset: number;
};

export async function computeLedger(seasonYear: number) {
  const { users, weekResults, currentWeekNumber } = await computeCurrentSeasonStats(seasonYear);
  const ledgerWeeks: WeekResult[] = weekResults.filter((w) => w.weekNumber >= TIE_SPLIT_START_WEEK);

  const settledWeeks = ledgerWeeks.filter((w) => !w.inProgress);
  const lastSettledWeek = settledWeeks.length ? settledWeeks[settledWeeks.length - 1].weekNumber : null;

  const payments = await prisma.payment.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  const players: LedgerPlayer[] = users.map((u) => {
    // The league settles up AFTER each week ends, not in advance - so a
    // week's buy-in (and any winnings) only hit balances once that week is
    // settled. An in-progress week contributes nothing yet.
    const weeks = settledWeeks.map((w) => {
      const won = w.payouts.find((p) => p.name === u.name)?.amount ?? 0;
      return { weekNumber: w.weekNumber, inProgress: false, buyIn: WEEKLY_BUYIN, won, net: won - WEEKLY_BUYIN };
    });
    const netFromWeeks = weeks.reduce((a, w) => a + w.net, 0);
    const bank = isBanker(u.name);
    if (bank) {
      return {
        userId: u.id,
        name: u.name,
        weeks,
        netFromWeeks,
        paidIn: 0,
        paidOut: 0,
        balance: 0,
        isBank: true,
        bankOffset: -netFromWeeks,
      };
    }
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
      isBank: false,
      bankOffset: 0,
    };
  });

  // Rounding the bank has kept since the ledger started (goes toward hosting).
  const houseTotal = ledgerWeeks.reduce((a, w) => a + w.houseCut, 0);

  // Bank check - what the banker should physically be holding for the
  // league right now. Follows from the books balancing: every dollar charged
  // as a buy-in either went out as winnings, is kept as rounding, or is
  // still sitting in the pot. So cash on hand =
  //   pot not yet paid out (money from settled weeks still in the pot:
  //   the rollover into the current week, or its rollover out once it has
  //   settled - the current week's own buy-ins aren't charged yet)
  //   + credits held for players (positive balances)
  //   + rounding kept
  //   - buy-ins not collected yet (negative balances).
  // The banker's own buy-ins count as deposited (their offset entry).
  const current = weekResults.find((w) => w.weekNumber === currentWeekNumber) ?? null;
  const potPending = current ? (current.inProgress ? current.carryIn : current.carryOut) : 0;
  const others = players.filter((p) => !p.isBank);
  const creditsHeld = others.filter((p) => p.balance > 0).reduce((a, p) => a + p.balance, 0);
  const uncollected = others.filter((p) => p.balance < 0).reduce((a, p) => a - p.balance, 0);
  const bankCheck = {
    potPending,
    creditsHeld,
    houseTotal,
    uncollected,
    shouldHold: potPending + creditsHeld + houseTotal - uncollected,
  };

  return {
    players,
    payments,
    ledgerWeeks,
    weekResults,
    currentWeekNumber,
    lastSettledWeek,
    houseTotal,
    bankCheck,
    userCount: users.length,
  };
}
