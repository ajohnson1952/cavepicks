// lib/lock.ts
// Locking model: a player can manually "Lock In" any individual pick at any
// time, freezing whatever line is currently cached from the last background
// odds pull (no live API call needed). Anything still unlocked gets
// automatically force-locked AUTO_LOCK_MINUTES before that game's kickoff.

// The books cavepicks plays against, in preference order. No single book has
// 100% coverage in The Odds API: FanDuel is earliest and most complete for
// CFB (DraftKings' feed lags its own site by a day+ for late/Sunday/Monday
// games), but FanDuel itself occasionally misses a game DraftKings has. So
// each pull requests all of these in one call (free - cost is markets x
// regions, not book count) and each game uses the first book in this list
// that actually has a line for it. Keys must match The Odds API's
// `bookmakers` values exactly.
export const BOOK_PREFERENCE = ["fanduel", "draftkings", "betmgm"] as const;

export const AUTO_LOCK_MINUTES = 30;

export function isPastAutoLock(commenceTime: Date, now: Date = new Date()): boolean {
  const deadline = new Date(commenceTime.getTime() - AUTO_LOCK_MINUTES * 60_000);
  return now >= deadline;
}

// --- Central-time-aware date math -----------------------------------------
// The server runs in UTC (standard for Render and most cloud hosts), but the
// whole app is built around Central time. Using plain Date methods like
// getDay()/setHours() would silently operate in UTC, making the week
// boundary land at the wrong wall-clock time (roughly Monday evening CT
// instead of Tuesday midnight CT). These helpers do it correctly, including
// handling the CDT/CST switch automatically via Intl.

const WEEKDAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getCentralDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekdayNum: WEEKDAY_NUM[get("weekday")] ?? 0,
  };
}

// How far America/Chicago is from UTC, in minutes, at a given instant -
// automatically correct across the CDT/CST switch since it asks Intl
// directly rather than hardcoding an offset.
function centralOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((acc: Record<string, string>, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtcMs - date.getTime()) / 60_000;
}

// Converts a Central-time calendar date (at midnight) into the correct UTC instant.
function centralMidnightToUtc(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 6, 0, 0)); // any time on that date works for offset lookup
  const offsetMin = centralOffsetMinutes(guess);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMin * 60_000);
}

// Fixed calendar week: Tuesday 00:00 Central through the following Monday
// 23:59:59 Central - anchored to the actual Central-time date, not a rolling
// window from "now" and not the server's own (UTC) timezone.
export function getCurrentWeekBounds(now: Date = new Date()): { start: Date; end: Date } {
  const { year, month, day, weekdayNum } = getCentralDateParts(now);
  const daysSinceTuesday = (weekdayNum - 2 + 7) % 7;

  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceTuesday);

  const start = centralMidnightToUtc(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1); // 1ms before next Tuesday midnight CT

  return { start, end };
}
