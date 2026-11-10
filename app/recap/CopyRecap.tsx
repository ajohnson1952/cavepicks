"use client";

import { useState } from "react";
import { hapticSuccess } from "@/lib/haptics";
import HapticButton from "../HapticButton";

// "Copy for the group chat": puts the plain-text recap on the clipboard.
// The text is also shown in a box underneath, so it can be selected by hand
// if the browser blocks the clipboard.
export default function CopyRecap({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  async function copy() {
    hapticSuccess();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShow(true); // clipboard blocked - show the text so it can be copied by hand
    }
  }

  return (
    <div style={{ marginBottom: "12px" }}>
      <HapticButton onPress={copy} className="btn btn-lock">
        {copied ? "Copied ✓ - paste it in the chat" : "📋 Copy for the group chat"}
      </HapticButton>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="meta"
        style={{ background: "none", border: "none", padding: "6px 0 0", textDecoration: "underline", cursor: "pointer" }}
      >
        {show ? "Hide the text" : "Preview the text"}
      </button>
      {show && (
        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          rows={Math.min(24, text.split("\n").length + 1)}
          style={{
            width: "100%",
            marginTop: "8px",
            fontSize: "12px",
            lineHeight: 1.45,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            background: "var(--void)",
            color: "var(--ink)",
            border: "1px solid var(--border-soft)",
            borderRadius: "8px",
            padding: "8px",
          }}
        />
      )}
    </div>
  );
}
