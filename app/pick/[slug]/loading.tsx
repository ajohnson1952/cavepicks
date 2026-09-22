import { SkeletonPage } from "../../Skeleton";

export default function Loading() {
  return (
    <main>
      <SkeletonPage cards={10} cardLines={3} />
    </main>
  );
}
