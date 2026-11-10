// A player's name link WITH their "spirit animal" - the logo of the team
// they've picked most - in front of it. Same API as app/PlayerLink.tsx.
//
// Only for player-centric pages (standings, players, stats, pot, history).
// NOT on the Board, Watch, Guide or pick sheet: team logos there mean "this is
// the pick", so a favorite-team logo next to a name would read like one.
//
// Server components only (it reads the cached season data). One cached read
// per request, however many names are on the page.
import { cache } from "react";
import { CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { loadSeason, spiritTeams, type SpiritTeam } from "@/lib/playerStats";
import { logoFor } from "@/lib/darkLogo";
import { PlayerLink as PlainLink } from "./PlayerLink";

export const getSpirits = cache(async (): Promise<Map<string, SpiritTeam>> => {
  try {
    return spiritTeams(await loadSeason(CURRENT_SEASON_YEAR));
  } catch {
    return new Map(); // a missing logo must never take a page down
  }
});

/** Just the little logo (for spots that already wrap the name in their own link). */
export async function SpiritLogo({ name }: { name: string }) {
  const s = (await getSpirits()).get(name);
  const src = logoFor(s?.logo ?? null);
  if (!s || !src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" title={`Most picked: ${s.team}`} className="spirit-logo" />;
}

export async function PlayerLink({ name }: { name: string }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <SpiritLogo name={name} />
      <PlainLink name={name} />
    </span>
  );
}

/** Several names: "A & B", or "A, B & C". */
export function PlayerNames({ names }: { names: string[] }) {
  return (
    <>
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && (i === names.length - 1 ? " & " : ", ")}
          <PlayerLink name={n} />
        </span>
      ))}
    </>
  );
}
