import { prisma } from "@/lib/db";
import { WEEKLY_BUYIN, DOG_BUYIN } from "@/lib/pot";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const weeks = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const allPicks = await prisma.pick.findMany({ where: { week: { seasonYear: 2026 } } });
  const allGames = await prisma.game.findMany({ where: { week: { seasonYear: 2026 } } });

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
    const weekFullyGraded = weekGames.length > 0 && weekGames.every((g) => g.isFinal);

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

    weekResults.push({
      weekNumber: week.weekNumber,
      potAmount,
      leader,
      rollover,
      inProgress: !weekFullyGraded,
      standings,
    });
  }

  const currentWeek = weekResults[weekResults.length - 1] ?? null;

  // --- Season-long dog race ---
  const dogPicks = allPicks.filter((p) => p.pickType === "DOG");
  const dogPointsByUser = new Map<string, number>();
  for (const u of users) dogPointsByUser.set(u.id, 0);
  for (const p of dogPicks) {
    if (p.graded) dogPointsByUser.set(p.userId, (dogPointsByUser.get(p.userId) ?? 0) + p.pointsEarned);
  }
  const dogStandings = users
    .map((u) => ({ name: u.name, points: dogPointsByUser.get(u.id) ?? 0 }))
    .sort((a, b) => b.points - a.points);
  const dogPotTotal = DOG_BUYIN * users.length;

  return (
    <main>
      <h1>Standings</h1>
      <p className="subtext">Weekly pot and the season-long dog race.</p>

      <div className="card">
        <div className="row-between">
          <div className="matchup">Weekly pot</div>
          <div className="meta mono">${currentWeek?.potAmount ?? 0}</div>
        </div>
        {currentWeek && (
          <p className="subtext" style={{ margin: "4px 0 0" }}>
            Week {currentWeek.weekNumber} &middot;{" "}
            {currentWeek.inProgress
              ? "in progress"
              : currentWeek.rollover
              ? "tied - rolled over to next week"
              : `won by ${currentWeek.leader}`}
          </p>
        )}
        <div className="divider" />
        {currentWeek?.standings.map((s) => (
          <div key={s.name} style={{ fontSize: "13px", marginBottom: "4px" }}>
            {s.name} <span className="mono" style={{ color: "var(--dim)" }}>{s.correct}/5</span>
          </div>
        ))}
      </div>

      {weekResults.length > 1 && (
        <div className="card">
          <div className="matchup">Pot history</div>
          <div className="divider" />
          {weekResults
            .slice(0, -1)
            .reverse()
            .map((w) => (
              <div key={w.weekNumber} style={{ fontSize: "13px", marginBottom: "4px" }}>
                Week {w.weekNumber}:{" "}
                {w.rollover ? (
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

      <div className="card">
        <div className="row-between">
          <div className="matchup">Dog race</div>
          <div className="meta mono">${dogPotTotal} pot</div>
        </div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>
          Season-long &middot; paid to the leader at year&apos;s end
        </p>
        <div className="divider" />
        {dogStandings.map((s, i) => (
          <div key={s.name} className="row-between" style={{ fontSize: "13px", marginBottom: "4px" }}>
            <span>
              {i === 0 && s.points > 0 ? "🏆 " : ""}
              {s.name}
            </span>
            <span className="mono">{s.points} pts</span>
          </div>
        ))}
      </div>

      <p className="subtext">
        <a href="/board">Board</a>
      </p>
    </main>
  );
}
