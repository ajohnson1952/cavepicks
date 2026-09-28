import { SkeletonCard } from "./Skeleton";

// Home page skeleton (also the fallback for any route without its own).
export default function Loading() {
  return (
    <main>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div className="skeleton" style={{ width: 56, height: 56, borderRadius: "14px" }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-line" style={{ width: "45%", height: "20px" }} />
          <div className="skeleton skeleton-line" style={{ width: "35%", marginBottom: 0 }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: "44px", marginBottom: "12px" }} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={6} />
    </main>
  );
}
