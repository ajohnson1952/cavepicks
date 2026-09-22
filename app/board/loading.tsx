import { SkeletonPage } from "../Skeleton";

export default function Loading() {
  return (
    <main>
      <SkeletonPage cards={7} cardLines={4} />
    </main>
  );
}
