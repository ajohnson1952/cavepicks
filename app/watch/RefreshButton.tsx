"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Re-runs the server component (fresh ESPN pull) without a full page reload.
export default function RefreshButton({ asOf }: { asOf: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="row-between" style={{ marginBottom: "12px" }}>
      <span className="meta">
        as of {asOf}
        {pending ? " · refreshing…" : ""}
      </span>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "…" : "Refresh"}
      </button>
    </div>
  );
}
