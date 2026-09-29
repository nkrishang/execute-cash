"use client";

import { useEffect, useRef, useState } from "react";
import { RefusalTip, useRefusal, useVisible } from "@/components/stage";

/** Every era of the button you'll never need. Order is chosen so each morph is a big jump. */
const STYLES = [
  { id: "glass", name: "Liquid Glass" },
  { id: "flat", name: "Flat" },
  { id: "brutal", name: "Neo-Brutalism" },
  { id: "clay", name: "Claymorphism" },
  { id: "terminal", name: "Terminal" },
  { id: "sketch", name: "Wireframe" },
  { id: "neon", name: "Neon" },
  { id: "win95", name: "Windows 95" },
  { id: "aqua", name: "Aqua" },
  { id: "soft", name: "Neumorphism" },
  { id: "pixel", name: "8-Bit" },
] as const;

/** Time on each style, including its morph in. */
const HOLD_MS = 2600;

export function MorphButton() {
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [instant, setInstant] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(stageRef);
  const { nope, refuse, nopeAttr } = useRefusal();

  const running = autoplay && !hovered && visible;
  const style = STYLES[index];

  // `?style=aqua` pins a style, applied without a morph; reduced motion starts paused.
  useEffect(() => {
    const pinned = new URLSearchParams(window.location.search).get("style");
    const i = STYLES.findIndex((s) => s.id === pinned);
    if (i >= 0) {
      setInstant(true);
      setIndex(i);
      setAutoplay(false);
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setInstant(false));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAutoplay(false);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % STYLES.length), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [running, index]);

  return (
    <div className="morph-root" data-instant={instant ? "" : undefined} data-offscreen={visible ? undefined : ""}>
      <div
        ref={stageRef}
        className="morph"
        data-style={style.id}
        data-nope={nopeAttr}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div className="morph-aura" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        {/* Crisp shapes behind the glass: sharp where they peek out, frosted through it. */}
        <div className="morph-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className="morph-shake">
          <span className="morph-hatch" aria-hidden="true" />
          <button
            type="button"
            className="morph-btn"
            onClick={refuse}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            aria-label="Connect Wallet — you'll never need to"
            aria-describedby="morph-tip"
          >
            <span className="fx fx-gloss" aria-hidden="true" />
            <span className="fx fx-sheen" aria-hidden="true" />
            <span className="fx fx-scan" aria-hidden="true" />
            <span className="fx fx-grain" aria-hidden="true" />
            <span className="fx fx-focus" aria-hidden="true" />
            <span className="morph-label" aria-hidden="true">
              <span className="morph-prompt">&gt;&nbsp;</span>
              <span className="morph-text">Connect Wallet</span>
              <span className="morph-cursor" />
            </span>
            <span className="morph-pixel" aria-hidden="true">
              Connect Wallet
            </span>
          </button>
          <span className="morph-stroke" aria-hidden="true" />
        </div>

        <RefusalTip nope={nope} />
      </div>
    </div>
  );
}
