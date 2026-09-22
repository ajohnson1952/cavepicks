import { SkeletonCard, SkeletonPage } from "../Skeleton";

export default function Loading() {
  return (
    <main>
      <div className="skeleton skeleton-line" style={{ width: "40%", height: "20px", marginBottom: "16px" }} />
      <SkeletonCard lines={2} />
      <div style={{ marginTop: "16px" }}>
        <div className="skeleton skeleton-line" style={{ width: "30%", height: "14px", marginBottom: "10px" }} />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-line" style={{ width: "100%", height: "16px" }} />
        ))}
      </div>
      <div style={{ marginTop: "20px" }}>
        <SkeletonPage cards={5} cardLines={3} />
      </div>
    </main>
  );
}
