// lib/lock.ts
// Each game locks independently, LOCK_OFFSET_MINUTES before its own kickoff -
// not one lock time for the whole week's slate. This lets Wednesday games
// lock Wednesday while Saturday lines keep moving until Saturday.

// lib/lock.ts

export const SPORTSBOOK = "draftkings"; // matches The Odds API's `bookmakers` param value

// Manual lock: a player can lock any individual pick at any time, freezing
// whatever line is currently cached from the last background pull.
// Auto-lock: anything still unlocked gets force-locked this many minutes before kickoff.
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

export function isGameLocked(commenceTime: Date, now: Date = new Date()): boolean {
  const lockAt = new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
  return now >= lockAt;
}

export function lockTimeFor(commenceTime: Date): Date {
  return new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
}
