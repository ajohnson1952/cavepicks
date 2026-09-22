// Shared skeleton-loading pieces for route-level loading.tsx files. Plain
// markup, no hooks - these render as static Server Components, same as any
// other page while its real data is still being fetched.
export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="skeleton skeleton-line" style={{ width }} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card">
      <div className="skeleton skeleton-line" style={{ width: "45%", height: "16px", marginBottom: "10px" }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "60%" : "90%"} />
      ))}
    </div>
  );
}

export function SkeletonPage({ cards = 4, cardLines = 3 }: { cards?: number; cardLines?: number }) {
  return (
    <>
      <div className="skeleton skeleton-line" style={{ width: "50%", height: "20px", marginBottom: "16px" }} />
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} lines={cardLines} />
      ))}
    </>
  );
}
