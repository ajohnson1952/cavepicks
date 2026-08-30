// lib/currentWeek.ts
import { prisma } from "./db";

// Season anchor: the Tuesday that begins Week 1. Week numbers advance every
// 7 days from here, matching the Tuesday-Monday boundaries in lib/lock.ts.
export const SEASON_YEAR = 2026;
const SEASON_START = new Date("2026-08-25T00:00:00Z");

export function getWeekNumberForDate(date: Date = new Date()): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = date.getTime() - SEASON_START.getTime();
  return Math.max(0, Math.floor(diff / msPerWeek));
}

// Auto-creates the week row the first time anything touches a new week -
// odds pulls, page loads, whatever hits it first.
export async function getOrCreateCurrentWeek() {
  const weekNumber = getWeekNumberForDate();
  return prisma.week.upsert({
    where: { seasonYear_weekNumber: { seasonYear: SEASON_YEAR, weekNumber } },
    update: {},
    create: { seasonYear: SEASON_YEAR, weekNumber },
  });
}
