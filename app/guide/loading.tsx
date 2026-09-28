import { SkeletonCard } from "../Skeleton";

// Mirrors GuideTimeline's real geometry (58px bars on a 66px row pitch, 24px
// hour-label strip) so the page doesn't jump when data arrives.
const BAR_OFFSETS = [0, 90, 200];

export default function Loading() {
  return (
    <main>
      <div className="skeleton skeleton-line" style={{ width: "40%", height: "20px", marginBottom: "16px" }} />
      <div className="skeleton skeleton-line" style={{ width: "30%", marginBottom: "12px" }} />
      <SkeletonCard lines={2} />
      <div className="skeleton skeleton-line" style={{ width: "85%", margin: "10px 0" }} />
      {Array.from({ length: 2 }).map((_, d) => (
        <section key={d} style={{ marginTop: "18px" }}>
          <div className="skeleton skeleton-line" style={{ width: "25%", height: "12px", marginBottom: "6px" }} />
          <div className="guide-scroll">
            <div className="guide-track" style={{ height: BAR_OFFSETS.length * 66 + 24 }}>
              {BAR_OFFSETS.map((left, i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ position: "absolute", top: 24 + i * 66, left, width: 252, height: 58, borderRadius: "8px" }}
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
