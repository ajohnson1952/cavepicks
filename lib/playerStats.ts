// Player pages (/players/[name]) and the group "who's hot" / conference
// boards on /stats. Everything comes from ONE cached load of the season's
// locked picks (loadSeason); the splits themselves are pure functions over
// those rows, so a page visit never wakes the database once the cache is warm.
//
// The cache refreshes when games are graded and when a pick is locked or
// unlocked (bumpPlayerStats), and hourly at worst. Only LOCKED picks are ever
// read - an unlocked pick is private to its player, same as everywhere else.
// The ghost player (Yahngo) lives in GhostPick, so it never shows up here.
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./db";
import { getWeekNumberForDate } from "./currentWeek";
import { computeCurrentSeasonStats } from "./seasonStats";
import { conferenceOf } from "./conferences";
import { playerSlug } from "./playerSlug";

export { playerSlug };

const TAG = "player-stats";

// ---------------------------------------------------------------- load

/** One locked pick, flattened to plain JSON (the cache stores JSON, so no Dates). */
export type PickRow = {
  user: string;
  week: number;
  type: "SPREAD" | "TOTAL" | "DOG";
  selection: string;
  line: number | null;
  dogValue: number | null;
  lockedAt: string | null;
  changes: number;
  graded: boolean;
  win: boolean | null;
  push: boolean | null;
  points: number;
  gameId: string;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeAbbr: string | null;
  awayAbbr: string | null;
  /** school name without the mascot ("Central Michigan") */
  homeShort: string;
  awayShort: string;
  homeConf: string | null;
  awayConf: string | null;
  homeLevel: "FBS" | "FCS" | null;
  awayLevel: "FBS" | "FCS" | null;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
  closeSpreadHome: number | null;
  closeSpreadAway: number | null;
  closeTotal: number | null;
  modelSide: string | null;
};

export type SeasonData = {
  seasonYear: number;
  currentWeek: number;
  players: string[];
  rows: PickRow[];
  /** settled weeks only: who won it outright and what each player was paid */
  weeks: {
    week: number;
    settled: boolean;
    leader: string | null;
    tiedLeaders: string[];
    payouts: { name: string; amount: number }[];
    potAmount: number;
    carryOut: number;
  }[];
  /** seasons before this app, summed per player (HistoricalSeasonRecord) */
  history: { name: string; seasons: number; wins: number; losses: number; weeksWon: number; dogPoints: number }[];
};

async function load(seasonYear: number): Promise<SeasonData> {
  const currentWeek = getWeekNumberForDate();
  const [users, picks, modelPicks, season, past] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.pick.findMany({
      where: { locked: true, week: { seasonYear, weekNumber: { gte: 1, lte: currentWeek } } },
      include: {
        user: { select: { name: true } },
        week: { select: { weekNumber: true } },
        game: { include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } },
      },
    }),
    prisma.modelPick
      .findMany({ where: { week: { seasonYear, weekNumber: { gte: 1 } } }, select: { gameId: true, pickType: true, selection: true } })
      .catch(() => []),
    computeCurrentSeasonStats(seasonYear),
    prisma.historicalSeasonRecord
      .findMany({ where: { seasonYear: { lt: seasonYear } }, include: { user: { select: { name: true } } } })
      .catch(() => []),
  ]);
  const history = new Map<string, SeasonData["history"][number]>();
  for (const h of past) {
    const cur = history.get(h.user.name) ?? { name: h.user.name, seasons: 0, wins: 0, losses: 0, weeksWon: 0, dogPoints: 0 };
    cur.seasons++;
    cur.wins += h.sideWins;
    cur.losses += h.sideLosses;
    cur.weeksWon += h.weeksWon;
    cur.dogPoints += h.dogPoints;
    history.set(h.user.name, cur);
  }
  const modelSide = new Map(modelPicks.map((m) => [`${m.gameId}_${m.pickType}`, m.selection]));

  const rows: PickRow[] = picks
    .filter((p) => !p.game.voided)
    .map((p) => {
      const g = p.game;
      const close = g.oddsSnapshots[0];
      const hc = conferenceOf(g.homeTeam, g.homeLogo);
      const ac = conferenceOf(g.awayTeam, g.awayLogo);
      return {
        user: p.user.name,
        week: p.week.weekNumber,
        type: p.pickType,
        selection: p.selection,
        line: p.lockedLine,
        dogValue: p.dogSpreadValue,
        lockedAt: p.lockedAt?.toISOString() ?? null,
        changes: p.selectionChanges,
        graded: p.graded,
        win: p.isWin,
        push: p.isPush,
        points: p.pointsEarned,
        gameId: g.id,
        home: g.homeTeam,
        away: g.awayTeam,
        homeLogo: g.homeLogo,
        awayLogo: g.awayLogo,
        homeAbbr: g.homeAbbr,
        awayAbbr: g.awayAbbr,
        homeShort: hc?.short ?? g.homeTeam,
        awayShort: ac?.short ?? g.awayTeam,
        homeConf: hc?.conf ?? null,
        awayConf: ac?.conf ?? null,
        homeLevel: hc?.level ?? null,
        awayLevel: ac?.level ?? null,
        kickoff: g.commenceTime.toISOString(),
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        isFinal: g.isFinal,
        closeSpreadHome: close?.spreadHome ?? null,
        closeSpreadAway: close?.spreadAway ?? null,
        closeTotal: close?.total ?? null,
        modelSide: modelSide.get(`${g.id}_${p.pickType}`) ?? null,
      };
    });

  return {
    seasonYear,
    currentWeek,
    players: users.map((u) => u.name),
    rows,
    weeks: season.weekResults.map((w) => ({
      week: w.weekNumber,
      settled: !w.inProgress,
      leader: w.leader,
      tiedLeaders: w.tiedLeaders,
      payouts: w.payouts,
      potAmount: w.potAmount,
      carryOut: w.carryOut,
    })),
    history: [...history.values()],
  };
}

const cachedLoad = unstable_cache(load, [TAG], { revalidate: 3600, tags: [TAG] });

/** The cached season, with the current week always taken fresh from the clock. */
export async function loadSeason(seasonYear: number): Promise<SeasonData> {
  const data = await cachedLoad(seasonYear);
  return { ...data, currentWeek: getWeekNumberForDate() };
}

export function bumpPlayerStats() {
  try {
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // outside a request - the hourly refresh covers it
  }
}

// ---------------------------------------------------------------- helpers


export type Rec = { w: number; l: number; p: number; n: number; pct: number | null };

/** Below this many decided picks a split is shown greyed out - too small to read anything into. */
export const MIN_SAMPLE = 8;

export function rec(rows: PickRow[]): Rec {
  let w = 0, l = 0, p = 0;
  for (const r of rows) {
    if (!r.graded) continue;
    if (r.push) p++;
    else if (r.win) w++;
    else if (r.win === false) l++;
  }
  return { w, l, p, n: rows.length, pct: w + l > 0 ? (w / (w + l)) * 100 : null };
}

export const decided = (r: Rec) => r.w + r.l;
/** "7-3", or "7-3-1" with pushes. */
export const recText = (r: Rec) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`;
/** Points without a pointless ".0": 14 -> "14", 5.5 -> "5.5". */
export const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const isSide = (r: PickRow) => r.type === "SPREAD" || r.type === "TOTAL";
export const isOver = (r: PickRow) => r.selection.toLowerCase() === "over";

const CT = "America/Chicago";
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short" });
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "numeric", minute: "numeric", hourCycle: "h23" });
const DAY_ORDER = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
const DAY_NAME: Record<string, string> = {
  Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday", Mon: "Monday",
};

function ctMinutes(iso: string) {
  const parts = hourFmt.formatToParts(new Date(iso));
  const h = Number(parts.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(parts.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** The team a side pick is ON (spread) - null for totals. */
const pickedTeam = (r: PickRow) => (r.type === "TOTAL" ? null : r.selection);
export const pickedIsHome = (r: PickRow) => r.selection === r.home;
/** A team's school name (no mascot) - falls back to the full name for rows cached before school names existed. */
export const shortOf = (r: PickRow, team: string) =>
  team === r.home ? r.homeShort ?? team : team === r.away ? r.awayShort ?? team : team;

/** Conference bucket for a team: its FBS conference, or "FCS" for any FCS team. */
function bucket(conf: string | null, level: "FBS" | "FCS" | null) {
  if (!conf) return null;
  return level === "FCS" ? "FCS" : conf;
}

/** The conferences a pick counts toward: the picked team's for a spread or dog,
 *  both teams' for a total (once if they share one). */
function pickConfs(r: PickRow): string[] {
  const home = bucket(r.homeConf, r.homeLevel);
  const away = bucket(r.awayConf, r.awayLevel);
  if (r.type === "TOTAL") return [...new Set([home, away].filter((c): c is string => !!c))];
  const c = pickedIsHome(r) ? home : away;
  return c ? [c] : [];
}

const isConfGame = (r: PickRow) =>
  !!r.homeConf && r.homeConf === r.awayConf && !/Indep/.test(r.homeConf);

export function clvOf(r: PickRow): number | null {
  if (r.line == null) return null;
  if (r.type === "SPREAD") {
    const close = pickedIsHome(r) ? r.closeSpreadHome : r.closeSpreadAway;
    return close == null ? null : r.line - close;
  }
  if (r.type === "TOTAL") {
    if (r.closeTotal == null) return null;
    return isOver(r) ? r.closeTotal - r.line : r.line - r.closeTotal;
  }
  return null;
}

type Labeled = { label: string; rec: Rec; share: number };

function groupBy(rows: PickRow[], keyOf: (r: PickRow) => string | string[] | null, order?: string[]): Labeled[] {
  const m = new Map<string, PickRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    for (const key of Array.isArray(k) ? k : k ? [k] : []) {
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
  }
  const total = rows.length || 1;
  const out = [...m.entries()].map(([label, rs]) => ({ label, rec: rec(rs), share: (rs.length / total) * 100 }));
  if (order) out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  else out.sort((a, b) => b.rec.n - a.rec.n);
  return out;
}

// ---------------------------------------------------------------- form (hot / cold)

export type WeekPoint = { week: number; w: number; l: number; p: number; pct: number | null; rolling: number | null };
export type Form = {
  season: Rec;
  last3: Rec;
  status: "hot" | "cold" | null;
  series: WeekPoint[];
  streak: { kind: "W" | "L"; count: number } | null;
};

export function formFor(sides: PickRow[], data: SeasonData): Form {
  const weekNums = [...new Set(sides.filter((r) => r.graded).map((r) => r.week))].sort((a, b) => a - b);
  const series: WeekPoint[] = weekNums.map((wk, i) => {
    const r = rec(sides.filter((x) => x.week === wk));
    const window = weekNums.slice(Math.max(0, i - 2), i + 1);
    const roll = rec(sides.filter((x) => window.includes(x.week)));
    return { week: wk, w: r.w, l: r.l, p: r.p, pct: r.pct, rolling: i >= 2 ? roll.pct : null };
  });

  // "last 3" = the three most recent weeks that have finished, so a half-graded
  // Saturday doesn't swing someone hot or cold off two picks
  const settled = new Set(data.weeks.filter((w) => w.settled).map((w) => w.week));
  const recentWeeks = weekNums.filter((w) => settled.has(w)).slice(-3);
  const season = rec(sides);
  const last3 = rec(sides.filter((r) => recentWeeks.includes(r.week)));
  let status: Form["status"] = null;
  if (decided(last3) >= 8 && season.pct != null && last3.pct != null) {
    if (last3.pct >= 55 && last3.pct - season.pct >= 5) status = "hot";
    else if (last3.pct <= 45 && season.pct - last3.pct >= 5) status = "cold";
    else if (last3.pct >= 65) status = "hot";
    else if (last3.pct <= 35) status = "cold";
  }

  const ordered = sides
    .filter((r) => r.graded && !r.push && r.win != null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  let streak: Form["streak"] = null;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const kind = ordered[i].win ? "W" : "L";
    if (!streak) streak = { kind, count: 1 };
    else if (streak.kind === kind) streak.count++;
    else break;
  }

  return { season, last3, status, series, streak };
}

// ---------------------------------------------------------------- one player

export type TeamLine = { team: string; picks: number; ats: Rec; dogPicks: number; dogWins: number };
export type Mate = { name: string; shared: number; same: number; pct: number };

export type Profile = {
  name: string;
  slug: string;
  rank: number;
  of: number;
  form: Form;
  weeksWon: number;
  potWon: number;
  bestWeek: { week: number; correct: number } | null;
  byType: { spread: Rec; total: Rec; over: Rec; under: Rec; fav: Rec; dog: Rec; home: Rec; road: Rec };
  lineSize: Labeled[];
  days: Labeled[];
  windows: Labeled[];
  conferences: Labeled[];
  confGame: { conf: Rec; nonConf: Rec };
  teams: TeamLine[];
  bestTeam: TeamLine | null;
  nemesis: TeamLine | null;
  fades: { team: string; count: number }[];
  lockTiming: Labeled[];
  avgHoursBefore: number | null;
  firstInstinct: Rec;
  changedMind: Rec;
  crowd: { withCrowd: Rec; against: Rec; solo: Rec };
  mates: Mate[];
  yahngo: { with: Rec; against: Rec };
  clv: { avg: number | null; beatPct: number | null; sample: number };
  dog: { picks: number; wins: number; losses: number; points: number; avgChased: number | null; biggest: { team: string; points: number; week: number } | null };
  thisWeek: PickRow[];
  /** conferences this player is king of (best record in it, 5+ decided picks) */
  kings: string[];
  /** past seasons + this one; null when there's no history before this season */
  career: { seasons: number; wins: number; losses: number; weeksWon: number; dogPoints: number } | null;
};

const LINE_ORDER = ["Pick'em to 3", "3.5 to 7", "7.5 to 14", "14.5+"];
const WINDOW_ORDER = ["Early (before 1pm)", "Afternoon (1–5pm)", "Night (6pm+)"];
const LOCK_ORDER = ["Last 2 hours", "Same day", "1–3 days out", "3+ days out"];

/** Every player's season side record - for the rank on each page. */
function ranking(data: SeasonData) {
  return data.players
    .map((name) => ({ name, r: rec(data.rows.filter((x) => x.user === name && isSide(x))) }))
    .sort((a, b) => (b.r.pct ?? -1) - (a.r.pct ?? -1));
}

export function findPlayer(data: SeasonData, slug: string): string | null {
  return data.players.find((n) => playerSlug(n) === slug) ?? null;
}

export function buildProfile(data: SeasonData, name: string): Profile {
  const mine = data.rows.filter((r) => r.user === name);
  const sides = mine.filter(isSide);
  const spreads = sides.filter((r) => r.type === "SPREAD" && r.line != null);
  const totals = sides.filter((r) => r.type === "TOTAL");
  const dogs = mine.filter((r) => r.type === "DOG");

  const ranked = ranking(data);
  const rank = ranked.findIndex((x) => x.name === name) + 1;

  // weeks
  const settled = data.weeks.filter((w) => w.settled);
  const weeksWon = settled.filter((w) => w.leader === name).length;
  const potWon = settled.reduce((s, w) => s + (w.payouts.find((p) => p.name === name)?.amount ?? 0), 0);
  const perWeek = settled.map((w) => ({
    week: w.week,
    correct: sides.filter((r) => r.week === w.week && r.win === true).length,
  }));
  const bestWeek = perWeek.length ? perWeek.reduce((a, b) => (b.correct > a.correct ? b : a)) : null;

  // teams (spread + dog picks are "on" a team; totals aren't)
  const teamMap = new Map<string, { spreads: PickRow[]; dogs: PickRow[] }>();
  for (const r of [...spreads, ...dogs]) {
    const t = pickedTeam(r);
    if (!t) continue;
    const cur = teamMap.get(t) ?? { spreads: [], dogs: [] };
    (r.type === "DOG" ? cur.dogs : cur.spreads).push(r);
    teamMap.set(t, cur);
  }
  const teams: TeamLine[] = [...teamMap.entries()]
    .map(([team, v]) => ({
      team: shortOf([...v.spreads, ...v.dogs][0], team),
      picks: v.spreads.length + v.dogs.length,
      ats: rec(v.spreads),
      dogPicks: v.dogs.length,
      dogWins: v.dogs.filter((d) => d.win === true).length,
    }))
    .sort((a, b) => b.picks - a.picks || (b.ats.pct ?? 0) - (a.ats.pct ?? 0));
  // perfect records (N-0 / 0-N) are the Midas touch / kiss of death lines instead,
  // so best team and nemesis only cover the ones in between
  const atsQualified = teams.filter((t) => decided(t.ats) >= 3 && t.ats.w > 0 && t.ats.l > 0);
  const byPct = [...atsQualified].sort((a, b) => (b.ats.pct ?? 0) - (a.ats.pct ?? 0) || b.ats.w - a.ats.w);
  const bestTeam = byPct[0] && (byPct[0].ats.pct ?? 0) > 50 ? byPct[0] : null;
  const last = byPct[byPct.length - 1];
  const nemesis = last && last !== bestTeam && (last.ats.pct ?? 100) < 50 ? last : null;
  const fadeMap = new Map<string, number>();
  for (const r of spreads) {
    const opp = pickedIsHome(r) ? r.awayShort ?? r.away : r.homeShort ?? r.home;
    fadeMap.set(opp, (fadeMap.get(opp) ?? 0) + 1);
  }
  const fades = [...fadeMap.entries()]
    .map(([team, count]) => ({ team, count }))
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // lock timing
  const withLock = sides.filter((r) => r.lockedAt);
  const hoursBefore = (r: PickRow) => (Date.parse(r.kickoff) - Date.parse(r.lockedAt!)) / 3_600_000;
  const lockTiming = groupBy(
    withLock,
    (r) => {
      const h = hoursBefore(r);
      return h < 2 ? LOCK_ORDER[0] : h < 12 ? LOCK_ORDER[1] : h < 72 ? LOCK_ORDER[2] : LOCK_ORDER[3];
    },
    LOCK_ORDER
  );
  const avgHoursBefore = withLock.length ? withLock.reduce((s, r) => s + hoursBefore(r), 0) / withLock.length : null;

  // the crowd: everyone else's locked pick on the same game + market
  const others = data.rows.filter((r) => r.user !== name && isSide(r));
  const byMarket = new Map<string, PickRow[]>();
  for (const r of others) {
    const k = `${r.gameId}_${r.type}`;
    const arr = byMarket.get(k) ?? [];
    arr.push(r);
    byMarket.set(k, arr);
  }
  const withCrowd: PickRow[] = [], against: PickRow[] = [], solo: PickRow[] = [];
  const mateMap = new Map<string, { shared: number; same: number }>();
  for (const r of sides) {
    const o = byMarket.get(`${r.gameId}_${r.type}`) ?? [];
    if (o.length === 0) {
      solo.push(r);
      continue;
    }
    const same = o.filter((x) => x.selection.toLowerCase() === r.selection.toLowerCase());
    if (same.length > o.length - same.length) withCrowd.push(r);
    else if (same.length < o.length - same.length) against.push(r);
    for (const x of o) {
      const cur = mateMap.get(x.user) ?? { shared: 0, same: 0 };
      cur.shared++;
      if (x.selection.toLowerCase() === r.selection.toLowerCase()) cur.same++;
      mateMap.set(x.user, cur);
    }
  }
  const mates: Mate[] = [...mateMap.entries()]
    .map(([n, v]) => ({ name: n, shared: v.shared, same: v.same, pct: (v.same / v.shared) * 100 }))
    .filter((m) => m.shared >= 3)
    .sort((a, b) => b.pct - a.pct || b.shared - a.shared);

  // closing line value
  const clvs = sides.map(clvOf).filter((c): c is number => c != null);

  const dogWins = dogs.filter((d) => d.graded && d.win === true);
  const biggest = dogWins.length ? dogWins.reduce((a, b) => (b.points > a.points ? b : a)) : null;
  const chased = dogs.map((d) => d.dogValue).filter((v): v is number => v != null);

  return {
    name,
    slug: playerSlug(name),
    rank,
    of: ranked.length,
    form: formFor(sides, data),
    weeksWon,
    potWon,
    bestWeek,
    byType: {
      spread: rec(sides.filter((r) => r.type === "SPREAD")),
      total: rec(totals),
      over: rec(totals.filter(isOver)),
      under: rec(totals.filter((r) => !isOver(r))),
      fav: rec(spreads.filter((r) => (r.line ?? 0) < 0)),
      dog: rec(spreads.filter((r) => (r.line ?? 0) > 0)),
      home: rec(spreads.filter(pickedIsHome)),
      road: rec(spreads.filter((r) => !pickedIsHome(r))),
    },
    lineSize: groupBy(
      spreads,
      (r) => {
        const a = Math.abs(r.line ?? 0);
        return a <= 3 ? LINE_ORDER[0] : a <= 7 ? LINE_ORDER[1] : a <= 14 ? LINE_ORDER[2] : LINE_ORDER[3];
      },
      LINE_ORDER
    ),
    days: groupBy(sides, (r) => DAY_NAME[weekdayFmt.format(new Date(r.kickoff))] ?? null, DAY_ORDER.map((d) => DAY_NAME[d])),
    windows: groupBy(
      sides,
      (r) => {
        const m = ctMinutes(r.kickoff);
        return m < 13 * 60 ? WINDOW_ORDER[0] : m < 18 * 60 ? WINDOW_ORDER[1] : WINDOW_ORDER[2];
      },
      WINDOW_ORDER
    ),
    conferences: groupBy(sides, pickConfs),
    confGame: { conf: rec(sides.filter(isConfGame)), nonConf: rec(sides.filter((r) => !isConfGame(r))) },
    teams: teams.slice(0, 8),
    bestTeam,
    nemesis,
    fades,
    lockTiming,
    avgHoursBefore,
    firstInstinct: rec(sides.filter((r) => r.changes === 0)),
    changedMind: rec(sides.filter((r) => r.changes > 0)),
    crowd: { withCrowd: rec(withCrowd), against: rec(against), solo: rec(solo) },
    mates,
    yahngo: {
      with: rec(sides.filter((r) => r.modelSide && r.modelSide.toLowerCase() === r.selection.toLowerCase())),
      against: rec(sides.filter((r) => r.modelSide && r.modelSide.toLowerCase() !== r.selection.toLowerCase())),
    },
    clv: {
      avg: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
      beatPct: clvs.length ? (clvs.filter((c) => c > 0).length / clvs.length) * 100 : null,
      sample: clvs.length,
    },
    dog: {
      picks: dogs.length,
      wins: dogWins.length,
      losses: dogs.filter((d) => d.graded && d.win === false).length,
      points: dogWins.reduce((s, d) => s + d.points, 0),
      avgChased: chased.length ? chased.reduce((a, b) => a + b, 0) / chased.length : null,
      biggest: biggest ? { team: shortOf(biggest, biggest.selection), points: biggest.points, week: biggest.week } : null,
    },
    kings: kingsOf(data).get(name) ?? [],
    career: (() => {
      const h = data.history.find((x) => x.name === name);
      if (!h) return null;
      const now = rec(sides);
      return {
        seasons: h.seasons + 1,
        wins: h.wins + now.w,
        losses: h.losses + now.l,
        weeksWon: h.weeksWon + weeksWon,
        dogPoints: h.dogPoints + dogWins.reduce((s, d) => s + d.points, 0),
      };
    })(),
    thisWeek: mine
      .filter((r) => r.week === data.currentWeek)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
  };
}

// ---------------------------------------------------------------- group boards for /stats

export type FormRow = { name: string; slug: string; form: Form; kings: string[] };

/** Everyone's recent form, hottest first. */
export function formBoard(data: SeasonData): FormRow[] {
  const kings = kingsOf(data);
  return data.players
    .map((name) => ({
      name,
      slug: playerSlug(name),
      form: formFor(data.rows.filter((r) => r.user === name && isSide(r)), data),
      kings: kings.get(name) ?? [],
    }))
    .filter((x) => x.form.season.n > 0)
    .sort((a, b) => (b.form.last3.pct ?? -1) - (a.form.last3.pct ?? -1));
}

export type ConfBoardRow = {
  conf: string;
  group: Rec;
  best: { name: string; slug: string; rec: Rec } | null;
  worst: { name: string; slug: string; rec: Rec } | null;
};

/** Per conference: the group's record, and who's best / worst at it (min 5 decided). */
export function conferenceBoard(data: SeasonData): ConfBoardRow[] {
  const sides = data.rows.filter(isSide);
  const confs = groupBy(sides, pickConfs);
  return confs
    .filter((c) => decided(c.rec) >= 5)
    .map((c) => {
      const inConf = sides.filter((r) => pickConfs(r).includes(c.label));
      const people = data.players
        .map((name) => ({ name, slug: playerSlug(name), rec: rec(inConf.filter((r) => r.user === name)) }))
        .filter((p) => decided(p.rec) >= 5);
      const ranked = [...people].sort((a, b) => (b.rec.pct ?? 0) - (a.rec.pct ?? 0) || b.rec.w - a.rec.w);
      const best = ranked[0] ?? null;
      const worstPick = people.length > 1 ? people.reduce((a, b) => ((b.rec.pct ?? 0) < (a.rec.pct ?? 0) ? b : a)) : null;
      const worst = worstPick && worstPick.name !== best?.name ? worstPick : null;
      return { conf: c.label, group: c.rec, best, worst };
    });
}

/** 👑 Conference kings: player name -> the conferences they're best at. */
export function kingsOf(data: SeasonData): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of conferenceBoard(data)) {
    if (!c.best) continue;
    m.set(c.best.name, [...(m.get(c.best.name) ?? []), c.conf]);
  }
  return m;
}

export type SpiritTeam = { team: string; logo: string | null; picks: number; ats: Rec };

/**
 * Each player's "spirit animal": the team they've picked most (spreads + dog
 * picks, same as the Teams table on their page). Ties go to the team they've
 * done better with ATS, then the most recent pick.
 */
export function spiritTeams(data: SeasonData): Map<string, SpiritTeam> {
  const out = new Map<string, SpiritTeam>();
  for (const name of data.players) {
    const on = data.rows.filter((r) => r.user === name && (r.type === "DOG" || (r.type === "SPREAD" && r.line != null)));
    const byTeam = new Map<string, PickRow[]>();
    for (const r of on) byTeam.set(r.selection, [...(byTeam.get(r.selection) ?? []), r]);
    let best: { team: string; rows: PickRow[]; ats: Rec; last: string } | null = null;
    for (const [team, rows] of byTeam) {
      const ats = rec(rows.filter((r) => r.type === "SPREAD"));
      const last = rows.reduce((m, r) => (r.kickoff > m ? r.kickoff : m), "");
      const better =
        !best ||
        rows.length > best.rows.length ||
        (rows.length === best.rows.length && (ats.w - ats.l > best.ats.w - best.ats.l || (ats.w - ats.l === best.ats.w - best.ats.l && last > best.last)));
      if (better) best = { team, rows, ats, last };
    }
    if (!best) continue;
    const r = best.rows[best.rows.length - 1];
    out.set(name, { team: shortOf(best.rows[0], best.team), logo: pickedIsHome(r) ? r.homeLogo : r.awayLogo, picks: best.rows.length, ats: best.ats });
  }
  return out;
}

/** The season as it stood at the end of week n (for "what changed this week"). */
export function upTo(data: SeasonData, n: number): SeasonData {
  return { ...data, rows: data.rows.filter((r) => r.week <= n), weeks: data.weeks.filter((w) => w.week <= n) };
}
