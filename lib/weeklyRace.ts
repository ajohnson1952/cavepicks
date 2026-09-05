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

export function buildRaceBlurb(
  rows: PlayerRace[],
  decidedGames: number,
  totalGamesWithPicks: number
): string {
  const withPicks = rows.filter((r) => r.totalPicks > 0);
  const noPicks = rows.filter((r) => r.totalPicks === 0);
  const gs = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

  if (withPicks.length === 0) return "No side picks in for this week yet.";

  if (decidedGames === 0) {
    let s = `Nothing decided yet — ${gs(totalGamesWithPicks)} on the board with side picks, everyone still alive.`;
    if (noPicks.length > 0) s += ` No picks in from ${andJoin(noPicks.map((n) => n.name))}.`;
    return s;
  }

  const alive = withPicks.filter((r) => r.alive);
  const dead = withPicks.filter((r) => !r.alive);
  const maxBanked = Math.max(...alive.map((r) => r.banked), 0);
  const leaders = alive.filter((r) => r.banked === maxBanked);
  const chasers = alive.filter((r) => r.banked < maxBanked);

  const parts: string[] = [`Through ${decidedGames} of ${gs(totalGamesWithPicks)} with side picks:`];

  if (leaders.length === 1) {
    const L = leaders[0];
    parts.push(
      `${L.name} leads at ${L.banked}/${L.totalPicks}` +
        (L.undecided > 0 ? `, ${L.undecided} still live.` : ` (done for the week).`)
    );
  } else if (leaders.length > 1) {
    parts.push(`${andJoin(leaders.map((l) => l.name))} are tied for the lead at ${maxBanked}.`);
  }

  if (chasers.length > 0) {
    parts.push(
      `Still alive: ` +
        andJoin(
          chasers.map(
            (c) => `${c.name} ${maxBanked - c.banked} back (${c.banked}/${c.totalPicks}, ${c.undecided} live)`
          )
        ) +
        `.`
    );
  }

  if (dead.length > 0) {
    parts.push(`Out: ${andJoin(dead.map((d) => `${d.name} (${d.banked}/${d.totalPicks})`))}.`);
  }

  const clincher = rows.find((r) => r.clinched);
  if (clincher) {
    parts.push(`${clincher.name} has clinched the week.`);
  } else if (alive.length === 1) {
    const A = alive[0];
    parts.push(`${A.name} controls it — ${A.undecided} pick${A.undecided === 1 ? "" : "s"} left to seal it.`);
  }

  if (noPicks.length > 0) parts.push(`No picks in from ${andJoin(noPicks.map((n) => n.name))}.`);

  return parts.join(" ");
}
