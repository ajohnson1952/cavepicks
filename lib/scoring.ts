// lib/scoring.ts
// Grades a single pick once the game is final.
// Main pickem standings = win/loss record on SPREAD + TOTAL picks (5/week).
// Dog race = separate, season-long accumulating point total from DOG picks only.

type Game = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

type Pick = {
  pickType: "SPREAD" | "TOTAL" | "DOG";
  selection: string; // team name, or "over"/"under"
  lockedLine: number | null;
  dogSpreadValue: number | null;
};

export type GradeResult = {
  isWin: boolean | null;
  isPush: boolean | null;
  pointsEarned: number;
};

export function gradePick(game: Game, pick: Pick): GradeResult {
  if (pick.pickType === "SPREAD") return gradeSpread(game, pick);
  if (pick.pickType === "TOTAL") return gradeTotal(game, pick);
  return gradeDog(game, pick);
}

function gradeSpread(game: Game, pick: Pick): GradeResult {
  const line = pick.lockedLine ?? 0;
  const pickedHome = pick.selection === game.homeTeam;
  const margin = pickedHome
    ? game.homeScore - game.awayScore
    : game.awayScore - game.homeScore;

  const adjusted = margin + line; // line is negative for favorites, positive for dogs
  if (adjusted === 0) return { isWin: null, isPush: true, pointsEarned: 0 };
  return { isWin: adjusted > 0, isPush: false, pointsEarned: 0 };
}

function gradeTotal(game: Game, pick: Pick): GradeResult {
  const line = pick.lockedLine ?? 0;
  const combined = game.homeScore + game.awayScore;
  if (combined === line) return { isWin: null, isPush: true, pointsEarned: 0 };
  const wentOver = combined > line;
  const pickedOver = pick.selection.toLowerCase() === "over";
  return { isWin: wentOver === pickedOver, isPush: false, pointsEarned: 0 };
}

// Dog pick: only pays out if the underdog wins straight up (moneyline).
// Win  -> pointsEarned = the spread magnitude they were getting (accumulates all season)
// Loss -> 0 points, no penalty, no push possible
function gradeDog(game: Game, pick: Pick): GradeResult {
  const pickedHome = pick.selection === game.homeTeam;
  const wonOutright = pickedHome
    ? game.homeScore > game.awayScore
    : game.awayScore > game.homeScore;

  if (!wonOutright) return { isWin: false, isPush: null, pointsEarned: 0 };

  const points = Math.abs(pick.dogSpreadValue ?? 0);
  return { isWin: true, isPush: null, pointsEarned: points };
}
