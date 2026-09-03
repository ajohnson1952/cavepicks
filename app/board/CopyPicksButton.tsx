"use client";

import { useEffect, useRef, useState } from "react";

// The little "copy picks" link next to each name on the Board. Opens a box
// with that player's picks as plain text, ready to paste into iMessage.
export default function CopyPicksButton({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (old browser / insecure context) - the textarea
      // is still selectable by hand, so this isn't fatal.
    }
  }

  const rows = Math.min(14, text.split("\n").length + 1);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block", fontWeight: 400 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost"
        style={{ width: "auto", padding: "1px 7px", fontSize: "11px", marginLeft: "8px", verticalAlign: "1px" }}
      >
        {open ? "close" : "copy picks"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 4px)",
            zIndex: 30,
            width: "min(84vw, 320px)",
            background: "var(--panel-alt)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          }}
        >
          <textarea
            readOnly
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            rows={rows}
            style={{
              width: "100%",
              resize: "vertical",
              fontSize: "12px",
              lineHeight: 1.45,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              background: "var(--void)",
              color: "var(--ink)",
              border: "1px solid var(--border-soft)",
              borderRadius: "6px",
              padding: "6px",
            }}
          />
          <button
            type="button"
            onClick={copy}
            className="btn btn-lock"
            style={{ width: "auto", marginTop: "6px", padding: "3px 12px", fontSize: "12px" }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      )}
    </span>
  );
}
