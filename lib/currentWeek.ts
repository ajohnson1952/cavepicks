// lib/currentWeek.ts
import { prisma } from "./db";
import { getCurrentWeekBounds } from "./lock";

// Season anchor: the Tuesday (00:00 Central) that begins Week 0. Week numbers
// advance every 7 days from here. Derived from getCurrentWeekBounds() so
// this can never disagree with the Tuesday-Monday boundaries in lib/lock.ts -
// previously these were two separate, inconsistent date calculations.
export const SEASON_YEAR = 2026;
const SEASON_WEEK_ZERO_START = getCurrentWeekBounds(new Date("2026-08-25T12:00:00Z")).start;

export function getWeekNumberForDate(date: Date = new Date()): number {
  const { start } = getCurrentWeekBounds(date);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = start.getTime() - SEASON_WEEK_ZERO_START.getTime();
  return Math.max(0, Math.round(diff / msPerWeek));
}

// Auto-creates the week row the first time anything touches a new week -
// odds pulls, page loads, whatever hits it first.
export async function getOrCreateCurrentWeek() {
  return getOrCreateWeekForDate(new Date());
}

// Same idea, but for an arbitrary date rather than "now" - used when pulling
// odds, since the API can return games from next week too (if lines are
// posted early), and each game needs to land in the week it actually
// belongs to, not just whatever week happens to be current at pull time.
export async function getOrCreateWeekForDate(date: Date) {
  const weekNumber = getWeekNumberForDate(date);
  return prisma.week.upsert({
    where: { seasonYear_weekNumber: { seasonYear: SEASON_YEAR, weekNumber } },
    update: {},
    create: { seasonYear: SEASON_YEAR, weekNumber },
  });
}
