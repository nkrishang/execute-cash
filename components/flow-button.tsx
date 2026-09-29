"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { RefusalTip, useRefusal, useVisible } from "@/components/stage";

/** The loop every DeFi user knows. */
const STEPS = ["Connect Wallet", "Approve tokens", "Switch network"] as const;

/** Where the cursor clicks on each step, in % of the button: a little different each time, like a hand. */
const TARGETS = [
  { x: 63, y: 60 },
  { x: 46, y: 64 },
  { x: 69, y: 55 },
];

/** Where the cursor rests between clicks, in % of the button. */
const HOME = { x: 104, y: 128 };

type Phase = "rest" | "approach" | "hover" | "press" | "loading";

const DURATION: Record<Phase, number> = {
  rest: 800,
  approach: 780,
  hover: 220,
  press: 150,
  loading: 1450,
};

const NEXT: Record<Phase, Phase> = {
  rest: "approach",
  approach: "hover",
  hover: "press",
  press: "loading",
  loading: "rest",
};

/**
 * One Aqua button, clicked through Connect Wallet, Approve tokens and Switch network forever,
 * with "Confirm in wallet" after every click.
 */
export function FlowButton() {
  const stageRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(stageRef);
  const { nope, refuse, nopeAttr } = useRefusal();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("rest");
  const [clicks, setClicks] = useState(0);
  const [still, setStill] = useState(false);

  // Reduced motion: the button stays put and there is no cursor.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true);
  }, []);

  const running = visible && !still;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      if (phase === "press") setClicks((c) => c + 1);
      if (phase === "loading") setStep((s) => (s + 1) % STEPS.length);
      setPhase(NEXT[phase]);
    }, DURATION[phase]);
    return () => window.clearTimeout(t);
  }, [phase, running]);

  // Six slots in a ring: each step's label, then its wait. The active slot is shown,
  // the one before it has just left upward, and the rest wait below.
  const active = phase === "loading" ? step * 2 + 1 : step * 2;
  const slot = (i: number) => (i === active ? "in" : i === (active + 5) % 6 ? "out" : "below");

  const onButton = phase === "approach" || phase === "hover" || phase === "press";
  const cursor = onButton ? TARGETS[step] : HOME;

  return (
    <div className="morph-root">
      <div
        ref={stageRef}
        className="morph flow"
        data-style="aqua"
        data-phase={phase}
        data-nope={nopeAttr}
        data-still={still ? "" : undefined}
      >
        <div className="morph-aura" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className="morph-shake">
          <button
            type="button"
            className="morph-btn"
            onClick={refuse}
            aria-label="Connect Wallet — you'll never need to"
            aria-describedby="morph-tip"
          >
            <span className="fx fx-gloss" aria-hidden="true" />
            <span className="fx fx-sheen" aria-hidden="true" />
            {phase === "loading" ? (
              <span
                key={clicks}
                className="flow-ripple"
                style={{ left: `${TARGETS[step].x}%`, top: `${TARGETS[step].y}%` }}
                aria-hidden="true"
              />
            ) : null}
            <span className="flow-ticker" aria-hidden="true">
              {STEPS.map((label, k) => (
                <Fragment key={label}>
                  <span className="flow-item morph-text" data-state={slot(k * 2)}>
                    {label}
                  </span>
                  <span className="flow-item flow-wait morph-text" data-state={slot(k * 2 + 1)}>
                    <span className="flow-spinner" />
                    Confirm in wallet
                  </span>
                </Fragment>
              ))}
            </span>
          </button>
        </div>

        <span className="flow-cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }} aria-hidden="true">
          <svg viewBox="0 0 17 24">
            <path
              d="M1.5 1.5v18.4l4.6-4.4 3.1 7 3.3-1.4-3-6.9h6.3L1.5 1.5Z"
              fill="#0b0b0c"
              stroke="#ffffff"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <RefusalTip nope={nope} />
      </div>
    </div>
  );
}
