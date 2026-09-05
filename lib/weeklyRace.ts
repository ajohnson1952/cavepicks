// lib/weeklyRace.ts
// Who can still win the weekly pot, and the plain-English state of the slate.
// Weekly winner = most CORRECT side picks (SPREAD + TOTAL only - dogs are the
// separate season race). A push is not correct. Pure functions, no DB / no IO.

export type PickOutcome =
  | "won"
  | "lost"
  | "push"
  | "live-covering" // game in progress, would win if it ended now
  | "live-losing" // game in progress, would lose if it ended now
  | "pending" // game hasn't started
  | "unknown"; // no line to grade against (shouldn't happen in practice)

export function isDecided(o: PickOutcome): boolean {
  return o === "won" || o === "lost" || o === "push";
}

export type PlayerRace = {
  userId: string;
  name: string;
  totalPicks: number;
  banked: number; // decided AND correct
  decided: number;
  undecided: number; // game not final yet
  floor: number; // banked (every remaining pick loses)
  ceiling: number; // banked + undecided (every remaining pick wins)
  alive: boolean; // ceiling can still reach the best locked-in count
  clinched: boolean; // floor already beats everyone else's ceiling - outright
};

export function computeRace(
  players: { userId: string; name: string }[],
  outcomesByUser: Map<string, PickOutcome[]>
): PlayerRace[] {
  const rows: PlayerRace[] = players.map((p) => {
    const outs = outcomesByUser.get(p.userId) ?? [];
    const banked = outs.filter((o) => o === "won").length;
    const decided = outs.filter(isDecided).length;
    const undecided = outs.length - decided;
    return {
      userId: p.userId,
      name: p.name,
      totalPicks: outs.length,
      banked,
      decided,
      undecided,
      floor: banked,
      ceiling: banked + undecided,
      alive: false,
      clinched: false,
    };
  });

  const topBanked = Math.max(0, ...rows.map((r) => r.banked));

  for (const r of rows) {
    // Conservative: alive if your best case reaches the highest count anyone
    // has already banked. Never eliminates someone who truly still has a path;
    // may keep a technically-dead player listed when shared games make it
    // impossible - a safe error for a "who to watch" view.
    r.alive = r.ceiling > 0 && r.ceiling >= topBanked;
    const othersCeiling = Math.max(
      0,
      ...rows.filter((x) => x.userId !== r.userId).map((x) => x.ceiling)
    );
    r.clinched = r.floor > 0 && r.floor > othersCeiling;
  }

  return rows.sort(
    (a, b) => b.banked - a.banked || b.ceiling - a.ceiling || a.name.localeCompare(b.name)
  );
}

function andJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// One tight narrative line - the shape of the race, not a per-player stat
// dump (the standings strip under it already has everyone's numbers).
export function buildRaceBlurb(
  rows: PlayerRace[],
  decidedGames: number,
  totalGamesWithPicks: number
): string {
  const withPicks = rows.filter((r) => r.totalPicks > 0);
  const noPicks = rows.filter((r) => r.totalPicks === 0);
  const gs = (n: number) => `${n} game${n === 1 ? "" : "s"}`;
  const tail = noPicks.length > 0 ? ` No picks in from ${andJoin(noPicks.map((n) => n.name))}.` : "";

  if (withPicks.length === 0) return "No side picks in for this week yet.";

  if (decidedGames === 0) {
    return `Nothing decided yet — ${gs(totalGamesWithPicks)} with side picks on the slate, everyone alive.${tail}`;
  }

  const progress = `Through ${decidedGames} of ${gs(totalGamesWithPicks)}`;

  const clincher = rows.find((r) => r.clinched);
  if (clincher) return `${progress}: ${clincher.name} has clinched the week — nobody else can catch up.${tail}`;

  const alive = withPicks.filter((r) => r.alive);
  const dead = withPicks.filter((r) => !r.alive);
  const maxBanked = Math.max(...alive.map((r) => r.banked), 0);
  const leaders = alive.filter((r) => r.banked === maxBanked);

  if (leaders.length >= 2 && leaders.length === alive.length && leaders.every((l) => l.undecided === 0)) {
    return `${progress}: ${andJoin(leaders.map((l) => l.name))} tied at ${maxBanked} with all picks in — pot rolls over as it stands.${tail}`;
  }

  const secondBanked = Math.max(0, ...alive.filter((r) => r.banked < maxBanked).map((r) => r.banked));
  const lead = maxBanked - secondBanked;

  const head =
    leaders.length >= 2
      ? `${andJoin(leaders.map((l) => l.name))} tied at the top (${maxBanked})`
      : lead > 0
      ? `${leaders[0].name} leads by ${lead}`
      : `${leaders[0].name} leads`;

  const field =
    dead.length === 0
      ? "everyone still alive"
      : alive.length === 2
      ? `down to ${andJoin(alive.map((a) => a.name))}`
      : `${alive.length} still alive, ${dead.length} out`;

  return `${progress}: ${head} — ${field}.${tail}`;
}
