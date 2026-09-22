import { SkeletonCard } from "../Skeleton";

export default function Loading() {
  return (
    <main>
      <div className="skeleton skeleton-line" style={{ width: "30%", height: "20px", marginBottom: "16px" }} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={7} />
      <SkeletonCard lines={7} />
    </main>
  );
}
