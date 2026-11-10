// A player's name, linked to their page. Use it anywhere a name shows up -
// except inside something that's already a link (a link can't hold a link).
// No hooks, so it works in server and client components alike.
import type { CSSProperties } from "react";
import { playerSlug } from "@/lib/playerSlug";

export function PlayerLink({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <a href={`/players/${playerSlug(name)}`} className="player-link" style={style}>
      {name}
    </a>
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
