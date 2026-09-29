"use client";

import { useEffect, useState } from "react";

/**
 * When a field's problems show: after a pause in typing, on leaving the field, or at once on
 * submit. From then on they follow every keystroke, so a fix clears them as it's typed.
 */
export function useProblemsShown(value: string): [boolean, () => void] {
  const [shown, setShown] = useState(false);
  const empty = !value.trim();
  useEffect(() => {
    if (empty) {
      setShown(false);
      return;
    }
    if (shown) return;
    const t = window.setTimeout(() => setShown(true), 800);
    return () => window.clearTimeout(t);
  }, [value, empty, shown]);
  // An empty field has nothing to say, even in the render before the effect catches up.
  return [shown && !empty, () => !empty && setShown(true)];
}

/** What's wrong with a field, under it; with `fix`, a button that makes the change. */
export function Problem({ id, message, fix, onFix }: { id: string; message: string; fix?: string; onFix?: (fix: string) => void }) {
  return (
    <p id={id} className="problem" role="alert">
      <svg className="problem-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.9v3.7M8 11v.05" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
      {fix && onFix && (
        <button type="button" className="problem-fix" onClick={() => onFix(fix)}>
          Use <code>{fix}</code>
        </button>
      )}
    </p>
  );
}
