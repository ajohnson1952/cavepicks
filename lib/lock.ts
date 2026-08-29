// lib/lock.ts
// Each game locks independently, LOCK_OFFSET_MINUTES before its own kickoff -
// not one lock time for the whole week's slate. This lets Wednesday games
// lock Wednesday while Saturday lines keep moving until Saturday.

export const LOCK_OFFSET_MINUTES = 60;

export const SPORTSBOOK = "draftkings"; // matches The Odds API's `bookmakers` param value

export function isGameLocked(commenceTime: Date, now: Date = new Date()): boolean {
  const lockAt = new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
  return now >= lockAt;
}

export function lockTimeFor(commenceTime: Date): Date {
  return new Date(commenceTime.getTime() - LOCK_OFFSET_MINUTES * 60_000);
}
