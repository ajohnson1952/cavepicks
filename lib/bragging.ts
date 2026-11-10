// Bragging rights: rivalries, bad beats, kiss of death, the trophy case and
// the weekly recap. All pure functions over the cached season load
// (lib/playerStats.ts loadSeason) - nothing here touches the database.
import {
  type PickRow,
  type Rec,
  type SeasonData,
  rec,
  decided,
  isSide,
  isOver,
  pickedIsHome,
  shortOf,
  clvOf,
  formFor,
  kingsOf,
  upTo,
} from "./playerStats";

// ---------------------------------------------------------------- small helpers

const marketKey = (r: PickRow) => `${r.gameId}_${r.type}`;
const sameSide = (a: PickRow, b: PickRow) => a.selection.toLowerCase() === b.selection.toLowerCase();
export const gameLabel = (r: PickRow) => `${r.awayShort ?? r.away} @ ${r.homeShort ?? r.home}`;

/** "Georgia -7", "Over 52.5 (Navy @ Army)", "Navy (dog +14)" - school names, no mascots. */
export function pickLabel(r: PickRow): string {
  if (r.type === "TOTAL") return `${isOver(r) ? "Over" : "Under"} ${r.line ?? ""} (${gameLabel(r)})`;
  const team = shortOf(r, r.selection);
  if (r.type === "DOG") return `${team} (dog${r.dogValue != null ? ` +${r.dogValue}` : ""})`;
  if (r.line == null) return team;
  return `${team} ${r.line === 0 ? "PK" : `${r.line > 0 ? "+" : ""}${r.line}`}`;
}

/** "Georgia 27, Florida 20" - winner first. */
export function scoreLine(r: PickRow): string | null {
  if (r.homeScore == null || r.awayScore == null) return null;
  const home = r.homeShort ?? r.home;
  const away = r.awayShort ?? r.away;
  return r.homeScore >= r.awayScore ? `${home} ${r.homeScore}, ${away} ${r.awayScore}` : `${away} ${r.awayScore}, ${home} ${r.homeScore}`;
}

// ---------------------------------------------------------------- bad beats

/**
 * How many points the pick covered by (+) or missed by (-), from the final
 * score and the locked line. Spreads and totals only; null until final.
 */
export function coverMargin(r: PickRow): number | null {
  if (!r.graded || r.homeScore == null || r.awayScore == null || r.line == null) return null;
  if (r.type === "SPREAD") {
    const mine = pickedIsHome(r) ? r.homeScore - r.awayScore : r.awayScore - r.homeScore;
    return mine + r.line;
  }
  if (r.type === "TOTAL") {
    const total = r.homeScore + r.awayScore;
    return isOver(r) ? total - r.line : r.line - total;
  }
  return null;
}

/** A loss (or win) by this many points or fewer counts as a bad beat (or a lucky cover). */
export const BEAT_MARGIN = 1;

export type Beat = { user: string; week: number; pick: string; game: string; score: string | null; margin: number };

function toBeat(r: PickRow, margin: number): Beat {
  return { user: r.user, week: r.week, pick: pickLabel(r), game: gameLabel(r), score: scoreLine(r), margin };
}

/** Bad beats (lost by <= 1) and lucky covers (won by <= 1), closest first. */
export function beats(rows: PickRow[]): { bad: Beat[]; lucky: Beat[] } {
  const bad: Beat[] = [];
  const lucky: Beat[] = [];
  for (const r of rows) {
    if (!isSide(r) || r.push) continue;
    const m = coverMargin(r);
    if (m == null) continue;
    if (r.win === false && m < 0 && m >= -BEAT_MARGIN) bad.push(toBeat(r, m));
    if (r.win === true && m > 0 && m <= BEAT_MARGIN) lucky.push(toBeat(r, m));
  }
  bad.sort((a, b) => b.margin - a.margin || b.week - a.week);
  lucky.sort((a, b) => a.margin - b.margin || b.week - a.week);
  return { bad, lucky };
}

// ---------------------------------------------------------------- rivalries

export type Meeting = { week: number; game: string; a: string; b: string; aPick: string; bPick: string; winner: string | null; loser: string | null };

/** Every time two players took opposite sides of the same game + market (winner null = push). */
export function meetings(rows: PickRow[]): Meeting[] {
  const byMarket = new Map<string, PickRow[]>();
  for (const r of rows) {
    if (!isSide(r) || !r.graded) continue;
    byMarket.set(marketKey(r), [...(byMarket.get(marketKey(r)) ?? []), r]);
  }
  const out: Meeting[] = [];
  for (const picks of byMarket.values()) {
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i], b = picks[j];
        if (sameSide(a, b)) continue;
        const winner = a.win === true && !a.push ? a.user : b.win === true && !b.push ? b.user : null;
        out.push({
          week: a.week,
          game: gameLabel(a),
          a: a.user,
          b: b.user,
          aPick: pickLabel(a),
          bPick: pickLabel(b),
          winner,
          loser: winner == null ? null : winner === a.user ? b.user : a.user,
        });
      }
    }
  }
  return out;
}

export type Showdown = { week: number; game: string; winners: string[]; winPick: string; losers: string[]; losePick: string; push: boolean };

/** One line per game where the cave split: who was on each side and which side cashed. */
export function showdowns(rows: PickRow[]): Showdown[] {
  const byMarket = new Map<string, PickRow[]>();
  for (const r of rows) {
    if (!isSide(r) || !r.graded) continue;
    byMarket.set(marketKey(r), [...(byMarket.get(marketKey(r)) ?? []), r]);
  }
  const out: Showdown[] = [];
  for (const picks of byMarket.values()) {
    const sides = new Map<string, PickRow[]>();
    for (const p of picks) sides.set(p.selection.toLowerCase(), [...(sides.get(p.selection.toLowerCase()) ?? []), p]);
    if (sides.size < 2) continue;
    const [x, y] = [...sides.values()];
    const xWon = x[0].win === true && !x[0].push;
    const [w, l] = xWon ? [x, y] : [y, x];
    out.push({
      week: x[0].week,
      game: gameLabel(x[0]),
      winners: w.map((r) => r.user),
      winPick: pickLabel(w[0]),
      losers: l.map((r) => r.user),
      losePick: pickLabel(l[0]),
      push: !!x[0].push,
    });
  }
  return out.sort((a, b) => b.winners.length + b.losers.length - (a.winners.length + a.losers.length));
}

export type Rivalry = { a: string; b: string; aWins: number; bWins: number; ties: number; meetings: number };

/** Head-to-head records for every pair that has met. `a` is the one leading (alphabetical if even). */
export function rivalries(data: SeasonData): Rivalry[] {
  const pairs = new Map<string, Rivalry>();
  for (const m of meetings(data.rows)) {
    const [a, b] = [m.a, m.b].sort();
    const key = `${a}|${b}`;
    const cur = pairs.get(key) ?? { a, b, aWins: 0, bWins: 0, ties: 0, meetings: 0 };
    cur.meetings++;
    if (!m.winner) cur.ties++;
    else if (m.winner === a) cur.aWins++;
    else cur.bWins++;
    pairs.set(key, cur);
  }
  return [...pairs.values()].map((r) =>
    r.bWins > r.aWins ? { a: r.b, b: r.a, aWins: r.bWins, bWins: r.aWins, ties: r.ties, meetings: r.meetings } : r
  );
}

export type RivalLine = { opp: string; w: number; l: number; t: number; meetings: number };

export function rivalsOf(data: SeasonData, name: string): RivalLine[] {
  return rivalries(data)
    .filter((r) => r.a === name || r.b === name)
    .map((r) =>
      r.a === name
        ? { opp: r.b, w: r.aWins, l: r.bWins, t: r.ties, meetings: r.meetings }
        : { opp: r.a, w: r.bWins, l: r.aWins, t: r.ties, meetings: r.meetings }
    )
    .sort((x, y) => y.meetings - x.meetings || y.w - y.l - (x.w - x.l));
}

// ---------------------------------------------------------------- kiss of death / midas touch

export type TeamCurse = { user: string; team: string; logo: string | null; w: number; l: number };

/** Teams that never cover (kiss) or always cover (midas) when a player takes them. 3+ decided spread picks. */
export function curses(data: SeasonData): { kiss: TeamCurse[]; midas: TeamCurse[] } {
  const by = new Map<string, PickRow[]>();
  for (const r of data.rows) {
    if (r.type !== "SPREAD" || !r.graded) continue;
    const k = `${r.user}|${r.selection}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const kiss: TeamCurse[] = [];
  const midas: TeamCurse[] = [];
  for (const [k, rows] of by) {
    const [user, team] = k.split("|");
    const r = rec(rows);
    if (decided(r) < 3) continue;
    const last = rows[rows.length - 1];
    const line = { user, team: shortOf(last, team), logo: pickedIsHome(last) ? last.homeLogo : last.awayLogo, w: r.w, l: r.l };
    if (r.w === 0) kiss.push(line);
    if (r.l === 0) midas.push(line);
  }
  const order = (a: TeamCurse, b: TeamCurse) => b.w + b.l - (a.w + a.l);
  return { kiss: kiss.sort(order), midas: midas.sort(order) };
}

// ---------------------------------------------------------------- trophy case

export type TrophyDef = { key: string; emoji: string; name: string; desc: string };
export const TROPHIES: TrophyDef[] = [
  { key: "pot", emoji: "🍕", name: "Pot Winner", desc: "Won a weekly pot outright" },
  { key: "split", emoji: "🤝", name: "Split the Pie", desc: "Tied for the week and split the pot" },
  { key: "sweep", emoji: "🧹", name: "Clean Sweep", desc: "5 for 5 in a week" },
  { key: "bigdog", emoji: "🐕", name: "Big Dog", desc: "Hit a dog pick worth 14+ points" },
  { key: "crystal", emoji: "🔮", name: "Crystal Ball", desc: "Beat the closing line on all 5 picks in a week" },
  { key: "heater", emoji: "🚬", name: "Heater", desc: "Won 5 picks in a row" },
  { key: "island", emoji: "🏝️", name: "Island Hopper", desc: "Won 3+ picks nobody else took in one week" },
  { key: "goose", emoji: "🥚", name: "Goose Egg", desc: "0 for 5 in a week" },
  { key: "icebath", emoji: "🧊", name: "Ice Bath", desc: "Lost 5 picks in a row" },
  { key: "heartbreak", emoji: "😭", name: "Heartbreak Kid", desc: "Lost a pick by a point or less" },
];
const DEF = new Map(TROPHIES.map((t) => [t.key, t]));

export type TrophyWin = TrophyDef & { weeks: number[] };

/** Every trophy a player has earned, with the weeks each was earned in. */
export function trophiesFor(data: SeasonData, name: string): TrophyWin[] {
  const mine = data.rows.filter((r) => r.user === name);
  const sides = mine.filter(isSide);
  const settled = data.weeks.filter((w) => w.settled);
  const earned = new Map<string, number[]>();
  const add = (key: string, week: number) => earned.set(key, [...(earned.get(key) ?? []), week]);

  for (const w of settled) {
    if (w.leader === name) add("pot", w.week);
    else if (w.payouts.some((p) => p.name === name)) add("split", w.week);
    const wk = sides.filter((r) => r.week === w.week);
    const r = rec(wk);
    if (r.w >= 5) add("sweep", w.week);
    if (r.w === 0 && decided(r) >= 4) add("goose", w.week);
    const clvs = wk.map(clvOf).filter((c): c is number => c != null);
    if (clvs.length >= 5 && clvs.every((c) => c > 0)) add("crystal", w.week);
  }
  for (const d of mine) if (d.type === "DOG" && d.win === true && d.points >= 14) add("bigdog", d.week);

  // streaks, in kickoff order - credited to the week the streak reached 5
  const ordered = sides.filter((r) => r.graded && !r.push && r.win != null).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  let run = 0;
  let kind: boolean | null = null;
  for (const r of ordered) {
    if (r.win === kind) run++;
    else {
      kind = r.win;
      run = 1;
    }
    if (run === 5) add(kind ? "heater" : "icebath", r.week);
  }

  // islands: picks nobody else locked, that won
  const others = new Set(data.rows.filter((r) => r.user !== name && isSide(r)).map((r) => marketKey(r)));
  const islandWins = new Map<number, number>();
  for (const r of sides) if (r.win === true && !others.has(marketKey(r))) islandWins.set(r.week, (islandWins.get(r.week) ?? 0) + 1);
  for (const [week, n] of islandWins) if (n >= 3) add("island", week);

  for (const b of beats(sides).bad) add("heartbreak", b.week);

  return TROPHIES.filter((t) => earned.has(t.key)).map((t) => ({ ...t, weeks: earned.get(t.key)!.sort((a, b) => a - b) }));
}

// ---------------------------------------------------------------- weekly recap

export type RecapPlayer = { name: string; correct: number; rec: Rec; dog: PickRow | null };

export type Recap = {
  week: number;
  settled: boolean;
  pot: { amount: number; leader: string | null; tied: string[]; payouts: { name: string; amount: number }[]; carryOut: number } | null;
  players: RecapPlayer[];
  group: Rec;
  sweeps: string[];
  geese: string[];
  dogHits: { user: string; team: string; points: number }[];
  dogPicks: number;
  badBeats: Beat[];
  lucky: Beat[];
  meetings: Meeting[];
  showdowns: Showdown[];
  consensus: { pick: string; game: string; count: number; of: number; result: "win" | "loss" | "push" | "pending" } | null;
  islands: { user: string; pick: string }[];
  yahngo: { with: Rec; against: Rec };
  newKings: { name: string; conf: string; from: string | null }[];
  newTrophies: { name: string; trophy: TrophyDef }[];
  hot: string[];
  cold: string[];
  top3: { name: string; rec: Rec }[];
  biggestWin: { user: string; pick: string; margin: number; game: string } | null;
  worstMiss: { user: string; pick: string; margin: number; game: string } | null;
};

export function weekRecap(data: SeasonData, week: number): Recap {
  const rows = data.rows.filter((r) => r.week === week);
  const sides = rows.filter(isSide);
  const wk = data.weeks.find((w) => w.week === week);
  const settled = !!wk?.settled;

  const players: RecapPlayer[] = data.players
    .map((name) => {
      const mine = sides.filter((r) => r.user === name);
      const r = rec(mine);
      return { name, correct: r.w, rec: r, dog: rows.find((x) => x.user === name && x.type === "DOG") ?? null };
    })
    .filter((p) => p.rec.n > 0 || p.dog)
    .sort((a, b) => b.correct - a.correct || a.rec.l - b.rec.l);

  const graded = sides.filter((r) => r.graded);
  const dogs = rows.filter((r) => r.type === "DOG");
  const { bad, lucky } = beats(graded);

  // the cave's biggest pile-on: most players on the same side of one market
  let consensus: Recap["consensus"] = null;
  const byMarket = new Map<string, PickRow[]>();
  for (const r of sides) byMarket.set(marketKey(r), [...(byMarket.get(marketKey(r)) ?? []), r]);
  for (const picks of byMarket.values()) {
    const groups = new Map<string, PickRow[]>();
    for (const p of picks) groups.set(p.selection.toLowerCase(), [...(groups.get(p.selection.toLowerCase()) ?? []), p]);
    for (const g of groups.values()) {
      if (g.length < 3 || (consensus && g.length <= consensus.count)) continue;
      const p = g[0];
      consensus = {
        pick: pickLabel(p),
        game: gameLabel(p),
        count: g.length,
        of: picks.length,
        result: !p.graded ? "pending" : p.push ? "push" : p.win ? "win" : "loss",
      };
    }
  }

  const islands = sides
    .filter((r) => r.win === true && (byMarket.get(marketKey(r))?.length ?? 0) === 1)
    .map((r) => ({ user: r.user, pick: pickLabel(r) }));

  // kings and trophies that are new as of this week
  const before = upTo(data, week - 1);
  const after = upTo(data, week);
  const kingBefore = new Map<string, string>();
  for (const [name, confs] of kingsOf(before)) for (const c of confs) kingBefore.set(c, name);
  const newKings: Recap["newKings"] = [];
  for (const [name, confs] of kingsOf(after))
    for (const c of confs) if (kingBefore.get(c) !== name) newKings.push({ name, conf: c, from: kingBefore.get(c) ?? null });
  const newTrophies: Recap["newTrophies"] = [];
  for (const name of data.players)
    for (const t of trophiesFor(after, name)) if (t.weeks.includes(week)) newTrophies.push({ name, trophy: DEF.get(t.key)! });

  const forms = data.players.map((name) => ({ name, f: formFor(after.rows.filter((r) => r.user === name && isSide(r)), after) }));

  const margins = graded
    .filter((r) => !r.push)
    .map((r) => ({ r, m: coverMargin(r) }))
    .filter((x): x is { r: PickRow; m: number } => x.m != null);
  const big = margins.filter((x) => x.r.win).sort((a, b) => b.m - a.m)[0];
  const miss = margins.filter((x) => x.r.win === false).sort((a, b) => a.m - b.m)[0];

  return {
    week,
    settled,
    pot: wk
      ? { amount: wk.potAmount, leader: wk.leader, tied: wk.tiedLeaders, payouts: wk.payouts, carryOut: wk.carryOut }
      : null,
    players,
    group: rec(sides),
    sweeps: players.filter((p) => p.rec.w >= 5).map((p) => p.name),
    geese: settled ? players.filter((p) => p.rec.w === 0 && decided(p.rec) >= 4).map((p) => p.name) : [],
    dogHits: dogs.filter((d) => d.win === true).map((d) => ({ user: d.user, team: shortOf(d, d.selection), points: d.points })),
    dogPicks: dogs.length,
    badBeats: bad,
    lucky,
    meetings: meetings(rows),
    showdowns: showdowns(rows),
    consensus,
    islands,
    yahngo: {
      with: rec(sides.filter((r) => r.modelSide && r.modelSide.toLowerCase() === r.selection.toLowerCase())),
      against: rec(sides.filter((r) => r.modelSide && r.modelSide.toLowerCase() !== r.selection.toLowerCase())),
    },
    newKings,
    newTrophies,
    hot: forms.filter((x) => x.f.status === "hot").map((x) => x.name),
    cold: forms.filter((x) => x.f.status === "cold").map((x) => x.name),
    top3: data.players
      .map((name) => ({ name, rec: rec(after.rows.filter((r) => r.user === name && isSide(r))) }))
      .sort((a, b) => (b.rec.pct ?? -1) - (a.rec.pct ?? -1))
      .slice(0, 3),
    biggestWin: big ? { user: big.r.user, pick: pickLabel(big.r), margin: big.m, game: gameLabel(big.r) } : null,
    worstMiss: miss ? { user: miss.r.user, pick: pickLabel(miss.r), margin: miss.m, game: gameLabel(miss.r) } : null,
  };
}

const recStr = (r: Rec) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`;
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The recap as plain text for the group chat. */
export function recapText(r: Recap): string {
  const L: string[] = [];
  L.push(`🏈 CAVEPICKS · WEEK ${r.week} RECAP${r.settled ? "" : " (in progress)"}`);
  L.push("");
  if (r.pot && r.settled) {
    if (r.pot.leader) L.push(`🍕 ${r.pot.leader} takes the $${r.pot.amount} pot`);
    else if (r.pot.tied.length && r.pot.payouts.length)
      L.push(`🍕 ${r.pot.tied.join(" & ")} split it - $${r.pot.payouts[0].amount} each, $${r.pot.carryOut} rolls`);
    else L.push(`🍕 Nobody won it - $${r.pot.carryOut} rolls to next week`);
  } else if (r.pot) L.push(`🍕 $${r.pot.amount} on the line`);
  L.push("");
  L.push("📊 THE WEEK");
  for (const p of r.players) {
    const tag = p.rec.w >= 5 ? " 🧹" : p.rec.w === 0 && decided(p.rec) >= 4 ? " 🥚" : "";
    const dog = p.dog ? (p.dog.win === true ? ` · 🐕 +${pts(p.dog.points)}` : "") : "";
    L.push(`${p.name} ${recStr(p.rec)}${tag}${dog}`);
  }
  L.push(`Cave: ${recStr(r.group)}${r.group.pct != null ? ` (${r.group.pct.toFixed(0)}%)` : ""}`);
  L.push("");
  const hl: string[] = [];
  if (r.dogHits.length) hl.push(`🐕 Dogs that barked: ${r.dogHits.map((d) => `${d.user} (${d.team} +${pts(d.points)})`).join(", ")}`);
  else if (r.settled && r.dogPicks) hl.push(`🐕 All ${r.dogPicks} dogs went to the pound`);
  if (r.badBeats[0]) {
    const b = r.badBeats[0];
    hl.push(`😭 Bad beat: ${b.user} - ${b.pick}, missed by ${pts(-b.margin)}`);
  }
  if (r.lucky[0]) {
    const b = r.lucky[0];
    hl.push(`🍀 Lucky: ${b.user} - ${b.pick}, by ${pts(b.margin)}`);
  }
  if (r.biggestWin) hl.push(`💪 Biggest cover: ${r.biggestWin.user} - ${r.biggestWin.pick} by ${pts(r.biggestWin.margin)}`);
  if (r.worstMiss) hl.push(`🧱 Worst miss: ${r.worstMiss.user} - ${r.worstMiss.pick} by ${pts(-r.worstMiss.margin)}`);
  if (r.consensus)
    hl.push(
      `🐑 Cave's favorite: ${r.consensus.pick} (${r.consensus.count} of ${r.consensus.of}) - ${
        r.consensus.result === "pending" ? "pending" : r.consensus.result === "win" ? "cashed ✅" : r.consensus.result === "push" ? "pushed" : "burned ❌"
      }`
    );
  if (r.islands.length)
    hl.push(
      `🏝️ Lone wolf wins: ${r.islands.slice(0, 4).map((i) => `${i.user}: ${i.pick}`).join("; ")}${
        r.islands.length > 4 ? ` +${r.islands.length - 4} more` : ""
      }`
    );
  const won = r.showdowns.filter((d) => !d.push);
  if (won.length)
    hl.push(`⚔️ Head-to-head: ${won.map((d) => `${d.winners.join(" & ")} beat ${d.losers.join(" & ")} on ${d.winPick}`).join("; ")}`);
  if (r.yahngo.with.n + r.yahngo.against.n > 0)
    hl.push(`🤖 With Yahngo ${recStr(r.yahngo.with)} · against ${recStr(r.yahngo.against)}`);
  if (hl.length) {
    L.push("🎬 HIGHLIGHTS");
    L.push(...hl);
    L.push("");
  }
  const news: string[] = [];
  for (const k of r.newKings) news.push(`👑 ${k.name} is the new King of the ${k.conf}${k.from ? ` (dethroned ${k.from})` : ""}`);
  for (const t of r.newTrophies) news.push(`${t.trophy.emoji} ${t.name} earned ${t.trophy.name}`);
  if (r.hot.length) news.push(`🚬 Heaters: ${r.hot.join(", ")}`);
  if (r.cold.length) news.push(`🧊 Ice cold: ${r.cold.join(", ")}`);
  if (news.length) {
    L.push("📰 NEWS");
    L.push(...news);
    L.push("");
  }
  if (r.top3.length) {
    L.push("🏆 SEASON TOP 3");
    r.top3.forEach((t, i) => L.push(`${["🥇", "🥈", "🥉"][i]} ${t.name} ${recStr(t.rec)}${t.rec.pct != null ? ` (${t.rec.pct.toFixed(1)}%)` : ""}`));
  }
  return L.join("\n").trim();
}
