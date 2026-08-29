// lib/lock.ts
// Locking model: a player can manually "Lock In" any individual pick at any
// time, freezing whatever line is currently cached from the last background
// odds pull (no live API call needed). Anything still unlocked gets
// automatically force-locked AUTO_LOCK_MINUTES before that game's kickoff.

export const SPORTSBOOK = "draftkings"; // matches The Odds API's `bookmakers` param value

export const AUTO_LOCK_MINUTES = 30;

export function isPastAutoLock(commenceTime: Date, now: Date = new Date()): boolean {
  const deadline = new Date(commenceTime.getTime() - AUTO_LOCK_MINUTES * 60_000);
  return now >= deadline;
}

// Fixed calendar week: Tuesday 00:00 through the following Monday 23:59:59,
// anchored to the actual date rather than a rolling window from "now" -
// prevents next week's early games from leaking in.
export function getCurrentWeekBounds(now: Date = new Date()): { start: Date; end: Date } {
  const day = now.getDay(); // 0=Sun ... 2=Tue ... 6=Sat
  const daysSinceTuesday = (day - 2 + 7) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceTuesday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}