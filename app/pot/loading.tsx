import { SkeletonCard } from "../Skeleton";

export default function Loading() {
  return (
    <main>
      <div className="skeleton skeleton-line" style={{ width: "30%", height: "20px", marginBottom: "8px" }} />
      <div className="skeleton skeleton-line" style={{ width: "55%", marginBottom: "16px" }} />
      <div className="card card-accent-money">
        <div className="skeleton skeleton-line" style={{ width: "40%", height: "16px", marginBottom: "10px" }} />
        <div className="skeleton" style={{ width: "35%", height: "38px", marginBottom: "10px" }} />
        <div className="skeleton skeleton-line" style={{ width: "70%" }} />
      </div>
      <SkeletonCard lines={3} />
      <SkeletonCard lines={8} />
      <SkeletonCard lines={5} />
    </main>
  );
}
