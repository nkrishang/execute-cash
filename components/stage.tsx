"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** True while the element is on screen and the tab is visible, so animations can rest otherwise. */
export function useVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setVisible(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [ref]);
  return visible;
}

/**
 * Clicking the Connect Wallet button gets a polite no. `nopeAttr` alternates on each
 * click so the shake animation restarts; it clears once the tooltip has been read.
 */
export function useRefusal() {
  const [nope, setNope] = useState(0);
  const refuse = useCallback(() => setNope((n) => n + 1), []);
  useEffect(() => {
    if (!nope) return;
    const t = window.setTimeout(() => setNope(0), 2200);
    return () => window.clearTimeout(t);
  }, [nope]);
  return { nope, refuse, nopeAttr: nope ? (nope % 2 ? "a" : "b") : undefined };
}

export function RefusalTip({ nope }: { nope: number }) {
  return (
    <p id="morph-tip" role="status" className="morph-tip" data-show={nope ? "" : undefined}>
      {nope ? "Nothing to connect. Just send." : ""}
    </p>
  );
}
