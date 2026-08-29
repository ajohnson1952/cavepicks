// lib/lock.ts
// Each game locks independently, LOCK_OFFSET_MINUTES before its own kickoff -
// not one lock time for the whole week's slate. This lets Wednesday games
// lock Wednesday while Saturday lines keep moving until Saturday.

export const LOCK_OFFSET_MINUTES = 60;

export const SPORTSBOOK = "draftkings"; // matches The Odds API's `bookmakers` param value

// How far ahead to show games as "this week's slate" - keeps far-future games
// (which the Odds API returns for the whole season) from cluttering the pick sheet
export const WEEK_WINDOW_DAYS = 8;

export function isInCurrentWeekWindow(commenceTime: Date, now: Date = new Date()): boolean {
  const windowEnd = new Date(now.getTime() + WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return commenceTime <= windowEnd;
}

export function isGameLocked(commenceTime: Date, now: Date = new Date()): boolean {
  const lockAt = new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
  return now >= lockAt;
}

export function lockTimeFor(commenceTime: Date): Date {
  return new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
}
