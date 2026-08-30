export default function WeekNav({
  basePath,
  weekNumber,
  minWeek,
  maxWeek,
  isCurrent,
}: {
  basePath: string;
  weekNumber: number;
  minWeek: number;
  maxWeek: number;
  isCurrent: boolean;
}) {
  return (
    <div className="row-between" style={{ marginBottom: "12px" }}>
      <a
        href={`${basePath}?week=${weekNumber - 1}`}
        className="btn"
        style={{ visibility: weekNumber > minWeek ? "visible" : "hidden" }}
      >
        &larr; Prev
      </a>
      <strong>
        Week {weekNumber}
        {isCurrent ? " (current)" : ""}
      </strong>
      <a
        href={`${basePath}?week=${weekNumber + 1}`}
        className="btn"
        style={{ visibility: weekNumber < maxWeek ? "visible" : "hidden" }}
      >
        Next &rarr;
      </a>
    </div>
  );
}
