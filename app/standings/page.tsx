import { prisma } from "@/lib/db";
import { WEEKLY_BUYIN, DOG_BUYIN, DOG_PAYOUTS } from "@/lib/pot";
import { getWeekNumberForDate } from "@/lib/currentWeek";

export const dynamic = "force-dynamic";

function rankLabel(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1);
}

export default async function StandingsPage() {
  const allWeeks = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const allPicks = await prisma.pick.findMany({ where: { week: { seasonYear: 2026 } } });
  const allGames = await prisma.game.findMany({ where: { week: { seasonYear: 2026 } } });

  // Week 1 is the real start of the season - Week 0 was test/setup data and
  // never counted for money. Future weeks that already have a placeholder
  // row (because a marquee game's line posted early) don't count as "real"
  // yet either - only weeks up through the actual current week matter here.
  const currentWeekNumber = getWeekNumberForDate();
  const weeks = allWeeks.filter((w) => w.weekNumber >= 1 && w.weekNumber <= currentWeekNumber);

  // --- Weekly pot, week by week, carrying the pot forward through ties ---
  type WeekResult = {
    weekNumber: number;
    potAmount: number;
    leader: string | null;
    rollover: boolean;
    inProgress: boolean;
    standings: { name: string; correct: number }[];
  };

  const weekResults: WeekResult[] = [];
  let potCarry = 0;

  for (const week of weeks) {
    const weekGames = allGames.filter((g) => g.weekId === week.id);
    // Voided (postponed/cancelled) games don't count toward completeness -
    // otherwise one postponed game would permanently block that week's pot
    // from ever resolving.
    const countableGames = weekGames.filter((g) => !g.voided);
    const weekFullyGraded = countableGames.length > 0 && countableGames.every((g) => g.isFinal);

    const weekPicks = allPicks.filter(
      (p) => p.weekId === week.id && (p.pickType === "SPREAD" || p.pickType === "TOTAL")
    );

    const correctByUser = new Map<string, number>();
    for (const u of users) correctByUser.set(u.id, 0);
    for (const p of weekPicks) {
      if (p.isWin) correctByUser.set(p.userId, (correctByUser.get(p.userId) ?? 0) + 1);
    }

    const standings = users
      .map((u) => ({ name: u.name, correct: correctByUser.get(u.id) ?? 0 }))
      .sort((a, b) => b.correct - a.correct);

    const potAmount = potCarry + WEEKLY_BUYIN * users.length;

    let leader: string | null = null;
    let rollover = false;

    if (weekFullyGraded) {
      const maxCorrect = Math.max(...standings.map((s) => s.correct));
      const leaders = standings.filter((s) => s.correct === maxCorrect);
      if (leaders.length === 1 && maxCorrect > 0) {
        leader = leaders[0].name;
        potCarry = 0;
      } else {
        rollover = true;
        potCarry = potAmount;
      }
    }
    // If the week isn't fully graded yet, potCarry is left untouched -
    // there's nothing to resolve yet, so nothing should roll forward.

    weekResults.push({
      weekNumber: week.weekNumber,
      potAmount,
      leader,
      rollover,
      inProgress: !weekFullyGraded,
      standings,
    });
  }

  // The "current" week is the one matching today's actual date - not just
  // whichever week happens to be last in the list (that assumption broke
  // once future placeholder weeks started existing in the database).
  const currentWeek = weekResults.find((w) => w.weekNumber === currentWeekNumber) ?? null;
  const pastWeeks = weekResults.filter((w) => w.weekNumber !== currentWeekNumber);

  // --- Cavepicks Leaderboard: season-long spread/total record (Week 1+ only) ---
  const sideTotalPicks = allPicks.filter(
    (p) =>
      (p.pickType === "SPREAD" || p.pickType === "TOTAL") &&
      p.graded &&
      weeks.some((w) => w.id === p.weekId)
  );
  const cavepicksStats = users
    .map((u) => {
      const userPicks = sideTotalPicks.filter((p) => p.userId === u.id);
      const wins = userPicks.filter((p) => p.isWin === true).length;
      const pushes = userPicks.filter((p) => p.isPush === true).length;
      const losses = userPicks.filter((p) => p.isWin === false && !p.isPush).length;
      const weeksWon = weekResults.filter((w) => w.leader === u.name).length;
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, weeksWon, wins, pushes, losses, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  // --- Cavedogs Leaderboard: season-long dog pick record (Week 1+ only) ---
  const dogPicksGraded = allPicks.filter(
    (p) => p.pickType === "DOG" && p.graded && weeks.some((w) => w.id === p.weekId)
  );
  const cavedogsStats = users
    .map((u) => {
      const userDogPicks = dogPicksGraded.filter((p) => p.userId === u.id);
      const wins = userDogPicks.filter((p) => p.isWin === true).length;
      const losses = userDogPicks.filter((p) => p.isWin === false).length;
      const points = userDogPicks.reduce((sum, p) => sum + (p.isWin ? p.pointsEarned : 0), 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, points, wins, losses, pct };
    })
    .sort((a, b) => b.points - a.points);

  const dogPotTotal = DOG_BUYIN * users.length;

  return (
    <main>
      <h1>Standings</h1>
      <p className="subtext">Weekly pot, season records, and the dog race.</p>

      <div className="card card-accent-money">
        <div className="matchup">💰 Weekly Pot</div>
        {currentWeek ? (
          <>
            <div className="stat-hero">${currentWeek.potAmount}</div>
            <p className="subtext" style={{ margin: "0 0 0" }}>
              Week {currentWeek.weekNumber} &middot;{" "}
              {currentWeek.inProgress
                ? "in progress"
                : currentWeek.rollover
                ? "tied - rolled over to next week"
                : `won by ${currentWeek.leader}`}
            </p>
            <div className="divider" />
            {currentWeek.standings.map((s, i) => (
              <div key={s.name} className="row-between" style={{ fontSize: "13px", marginBottom: "4px" }}>
                <span>{s.name}</span>
                <span className="mono" style={{ color: i === 0 && s.correct > 0 ? "var(--up)" : "var(--dim)" }}>
                  {s.correct}/5
                </span>
              </div>
            ))}
          </>
        ) : (
          <p className="subtext" style={{ margin: "4px 0 0" }}>
            Season hasn&apos;t started yet &mdash; Week 1 begins Tuesday.
          </p>
        )}
      </div>

      <div className="card">
        <div className="matchup">📊 Cavepicks Leaderboard</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>Season record, spread &amp; total picks</p>
        <table className="stat-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Weeks</th>
              <th>W</th>
              <th>P</th>
              <th>L</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {cavepicksStats.map((s, i) => (
              <tr key={s.name} className={i === 0 && s.pct > 0 ? "rank-first" : undefined}>
                <td className="rank-cell">{rankLabel(i)}</td>
                <td>{s.name}</td>
                <td>{s.weeksWon}</td>
                <td>{s.wins}</td>
                <td>{s.pushes}</td>
                <td>{s.losses}</td>
                <td>{s.pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pastWeeks.length > 0 && (
        <div className="card">
          <div className="matchup">📜 Pot History</div>
          <div className="divider" />
          {pastWeeks
            .slice()
            .reverse()
            .map((w) => (
              <div key={w.weekNumber} style={{ fontSize: "13px", marginBottom: "4px" }}>
                Week {w.weekNumber}:{" "}
                {w.inProgress ? (
                  <span className="meta">in progress</span>
                ) : w.rollover ? (
                  <span className="meta">tied, rolled over</span>
                ) : (
                  <span>
                    <span className="locked-badge" style={{ marginRight: "4px" }}>
                      <span className="locked-dot" />
                    </span>
                    {w.leader} won <span className="mono">${w.potAmount}</span>
                  </span>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="card card-accent-dog">
        <div className="matchup">🐕 Cavedogs Leaderboard</div>
        <div className="stat-hero up">${dogPotTotal}</div>
        <p className="subtext" style={{ margin: "0 0 0" }}>
          Season-long &middot; ${DOG_PAYOUTS.first}/${DOG_PAYOUTS.second}/${DOG_PAYOUTS.third} to 1st/2nd/3rd at year&apos;s end
        </p>
        <table className="stat-table" style={{ marginTop: "10px" }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Pts</th>
              <th>W</th>
              <th>L</th>
              <th>%</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {cavedogsStats.map((s, i) => {
              const payout = i === 0 ? DOG_PAYOUTS.first : i === 1 ? DOG_PAYOUTS.second : i === 2 ? DOG_PAYOUTS.third : 0;
              return (
                <tr key={s.name} className={i === 0 && s.points > 0 ? "rank-first" : undefined}>
                  <td className="rank-cell">{rankLabel(i)}</td>
                  <td>{s.name}</td>
                  <td>{s.points}</td>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.pct.toFixed(1)}%</td>
                  <td>{payout > 0 && s.points > 0 ? `$${payout}` : "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
