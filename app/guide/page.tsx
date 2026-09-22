import { formatSpread } from "@/lib/format";
import { isDecided } from "@/lib/weeklyRace";
import { computeWatchData } from "@/lib/watchData";
import RefreshButton from "../watch/RefreshButton";
import GuideTimeline, { GuideDay, GuideGame, GuidePick } from "./GuideTimeline";

export const dynamic = "force-dynamic";

const CT = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleString("en-US", { timeZone: "America/Chicago", ...opts });

// CFB broadcasts run ~3.5h in practice. Real games vary, but Cavepicks
// doesn't track an actual end time (only isFinal) - this is a fixed visual
// approximation, not a claim about the real broadcast length.
const ASSUMED_DURATION_MINUTES = 210;
const PX_PER_HOUR = 72;

function minutesSinceMidnightCT(d: Date): number {
  const [h, m] = CT(d, { hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return h * 60 + m;
}

const OUTCOME_UI: Record<string, { label: string; cls: string }> = {
  won: { label: "won", cls: "pick-win" },
  lost: { label: "lost", cls: "pick-loss" },
  push: { label: "push", cls: "pick-push" },
  "live-covering": { label: "covering", cls: "pick-win" },
  "live-losing": { label: "trailing", cls: "pick-loss" },
  pending: { label: "not started", cls: "pick-push" },
  missed: { label: "not locked", cls: "pick-loss" },
  unknown: { label: "?", cls: "pick-push" },
};

function abbrOf(selection: string, g: { homeTeam: string; homeAbbr: string | null; awayTeam: string; awayAbbr: string | null }) {
  if (selection === g.homeTeam) return g.homeAbbr ?? selection;
  if (selection === g.awayTeam) return g.awayAbbr ?? selection;
  return selection;
}

export default async function GuidePage() {
  const { week, pickedGames, statusOf, gameById, lineFor, outcome, aliveIds, blurb, picksByGame, relevanceOf } =
    await computeWatchData();

  const todayLabel = CT(new Date(), { weekday: "long", month: "short", day: "numeric" });
  const dayLabel = (d: Date) => CT(d, { weekday: "long", month: "short", day: "numeric" });

  const byDay = new Map<string, typeof pickedGames>();
  for (const g of pickedGames) {
    const key = dayLabel(g.commenceTime);
    const arr = byDay.get(key) ?? [];
    arr.push(g);
    byDay.set(key, arr);
  }

  const days: GuideDay[] = Array.from(byDay.entries()).map(([label, dayGames]) => {
    const sorted = dayGames.slice().sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime());
    const starts = sorted.map((g) => minutesSinceMidnightCT(g.commenceTime));
    const minMinutes = Math.floor(Math.min(...starts) / 60) * 60;
    const maxMinutes = Math.ceil((Math.max(...starts) + ASSUMED_DURATION_MINUTES) / 60) * 60;
    const totalWidthPx = ((maxMinutes - minMinutes) / 60) * PX_PER_HOUR;

    const hourTicks: GuideDay["hourTicks"] = [];
    for (let m = minMinutes; m <= maxMinutes; m += 60) {
      const hour12 = ((m / 60) % 12) || 12;
      const isPm = Math.floor(m / 60) % 24 >= 12;
      hourTicks.push({ leftPx: ((m - minMinutes) / 60) * PX_PER_HOUR, label: `${hour12}${isPm ? "p" : "a"}` });
    }

    const games: GuideGame[] = sorted.map((g) => {
      const st = statusOf.get(g.id)!;
      const startM = minutesSinceMidnightCT(g.commenceTime);
      const leftPx = ((startM - minMinutes) / 60) * PX_PER_HOUR;
      const widthPx = (ASSUMED_DURATION_MINUTES / 60) * PX_PER_HOUR;

      const gp = (picksByGame.get(g.id) ?? []).slice().sort((a, b) => a.user.name.localeCompare(b.user.name));
      const picks: GuidePick[] = gp.map((p) => {
        const o = outcome.get(p.id)!;
        const ui = OUTCOME_UI[o];
        const alive = aliveIds.has(p.userId);
        const { line } = lineFor(p);
        let label: string;
        if (p.pickType === "SPREAD") {
          label = `${abbrOf(p.selection, g)}${line != null ? ` ${formatSpread(line)}` : ""}`;
        } else if (p.pickType === "TOTAL") {
          label = line != null ? `${p.selection === "over" ? "o" : "u"}${line}` : p.selection;
        } else {
          label = `${abbrOf(p.selection, g)} ML`;
        }
        const showTag = isDecided(o) || o === "live-covering" || o === "live-losing" || o === "missed";
        return {
          id: p.id,
          name: p.user.name,
          label,
          outcomeLabel: showTag ? ui.label : "",
          outcomeCls: ui.cls,
          alive,
          isDog: p.pickType === "DOG",
        };
      });

      return {
        id: g.id,
        away: g.awayAbbr ?? g.awayTeam,
        home: g.homeAbbr ?? g.homeTeam,
        leftPx,
        widthPx,
        phase: st.phase,
        homeScore: st.homeScore,
        awayScore: st.awayScore,
        detail: st.detail,
        timeLabel: CT(g.commenceTime, { hour: "numeric", minute: "2-digit" }),
        broadcast: st.broadcast,
        rel: relevanceOf(g),
        picks,
      };
    });

    return {
      key: label,
      label,
      isToday: label === todayLabel,
      totalWidthPx,
      minMinutes,
      hourTicks,
      games,
    };
  });

  return (
    <main>
      <h1>Guide &mdash; Week {week.weekNumber}</h1>
      <RefreshButton asOf={CT(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT"} />

      <div className="card" style={{ borderColor: "var(--action)" }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{blurb}</p>
      </div>

      <p className="subtext" style={{ margin: "10px 0" }}>
        <strong style={{ color: "var(--action-soft)" }}>SWING</strong> = two or more players still alive have a
        pick on it. Scroll a day sideways to see the full slate; tap a game for picks.
      </p>

      <GuideTimeline days={days} pxPerHour={PX_PER_HOUR} />

      {pickedGames.length === 0 && <p className="subtext">No picks are in for this week yet.</p>}
    </main>
  );
}
