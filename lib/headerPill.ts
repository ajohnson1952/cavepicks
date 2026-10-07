// lib/headerPill.ts
// The "WK 6 · $175 POT" pill in the top bar. The week number is pure date
// math; the pot amount comes from the full season computation, which is far
// too heavy to run on every page just for a header - so that one number is
// cached. It refreshes whenever games are graded (bumpHeaderPill, called by
// the grading job) and at least hourly. The pill links to /pot, which is
// always computed live; this is only the at-a-glance copy.
import { unstable_cache, revalidateTag } from "next/cache";
import { computeCurrentSeasonStats } from "./seasonStats";
import { SEASON_YEAR, getWeekNumberForDate } from "./currentWeek";

const TAG = "header-pill";

const cachedPot = unstable_cache(
  async (seasonYear: number, weekNumber: number): Promise<number | null> => {
    const { weekResults } = await computeCurrentSeasonStats(seasonYear);
    return weekResults.find((w) => w.weekNumber === weekNumber)?.potAmount ?? null;
  },
  [TAG],
  { revalidate: 3600, tags: [TAG] }
);

export async function getHeaderPill(): Promise<{ weekNumber: number; potAmount: number | null }> {
  const weekNumber = getWeekNumberForDate();
  if (weekNumber < 1) return { weekNumber, potAmount: null };
  // a header must never take a page down with it
  const potAmount = await cachedPot(SEASON_YEAR, weekNumber).catch(() => null);
  return { weekNumber, potAmount };
}

export function bumpHeaderPill() {
  try {
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // outside a request - the hourly refresh covers it
  }
}
