"use client";

import { useEffect, useState } from "react";

/** Copies `value`, and says so for a moment. */
export function CopyButton({ value, label = "Copy", className = "btn btn-quiet" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      data-copied={copied ? "" : undefined}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {copied ? (
          <path d="m3.8 8.4 2.7 2.6 5.7-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 10.2V4.6C3 3.7 3.7 3 4.6 3h5.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
