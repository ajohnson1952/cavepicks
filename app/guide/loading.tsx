import { SkeletonCard } from "../Skeleton";

export default function Loading() {
  return (
    <main>
      <div className="skeleton skeleton-line" style={{ width: "40%", height: "20px", marginBottom: "16px" }} />
      <SkeletonCard lines={2} />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} style={{ marginTop: "18px" }}>
          <div className="skeleton skeleton-line" style={{ width: "25%", height: "12px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "100%", height: "180px", borderRadius: "10px" }} />
        </div>
      ))}
    </main>
  );
}
