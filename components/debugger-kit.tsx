"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { TextMorph } from "torph/react";
import type { CoinStage, Face, Mint } from "@/components/coin-stage";

/*
 * The debugger's parts, shared by the landing page's verify section and every address page: amounts
 * that roll to their value, hex that spins in on slot reels, names that morph in from a dash, the
 * marks beside them, the verdict's check, and the coin.
 */

/** A name or label not yet read. Numbers and hex wait at zero instead, so they can roll to their value. */
export const DASH = "—";
export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

// ---- Rolling figures -------------------------------------------------------------------------------

const money = (whole: number, cents: number) => `${whole.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;

/** Base units as "1,000.00": at least two decimals, and every further one that isn't a trailing zero. */
export function formatToken(v: bigint, decimals = 6) {
  const unit = 10n ** BigInt(decimals);
  const whole = (v / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (v % unit).toString().padStart(decimals, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${frac}`;
}

/**
 * An amount that counts up from 0.00 once read: a run of rising figures, each landing on torph's
 * roll of the one before, so its digits spin like a counter settling. Once read, a changed value
 * (a flipped bit) rolls straight to its new digits.
 */
export function useRoll(value: bigint, read: boolean, still: boolean, ms: number, decimals = 6) {
  const final = formatToken(value, decimals);
  const [shown, setShown] = useState(read ? final : "0.00");
  const wasRead = useRef(read);

  useEffect(() => {
    const before = wasRead.current;
    wasRead.current = read;
    if (!read) {
      setShown("0.00");
      return;
    }
    if (still || before) {
      setShown(final);
      return;
    }
    const whole = Number(value / 10n ** BigInt(decimals));
    const steps = 10;
    let k = 0;
    let t = 0;
    const tick = () => {
      k += 1;
      if (k >= steps) return setShown(final);
      // Quick at first, settling at the end; the cents tumble all the way.
      setShown(money(Math.floor(whole * (1 - (1 - k / steps) ** 3)), (k * 37 + 11) % 100));
      t = window.setTimeout(tick, ms / steps);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [read, final, value, still, ms, decimals]);

  return shown;
}

export function Money({
  value,
  decimals,
  read,
  bad,
  still,
  ms,
  className,
}: {
  value: bigint;
  decimals?: number;
  read: boolean;
  bad?: boolean;
  still: boolean;
  ms: number;
  className: string;
}) {
  const shown = useRoll(value, read, still, ms, decimals);
  return (
    <span className={className} data-d={read ? "" : undefined} data-bad={bad ? "" : undefined}>
      <TextMorph>{shown}</TextMorph>
    </span>
  );
}

// ---- Slot reels for hex -------------------------------------------------------------------------------

const GLYPHS = "0123456789abcdefABCDEF";
/** Each reel's strip: every glyph three times over, so a spin can travel two full turns before landing. */
const STRIP = Array.from({ length: 3 }, () => GLYPHS.split("").join("\n")).join("\n");
const REEL_MS = 760;
const REEL_STAGGER = 22;

/**
 * Hex that changes by spinning: every character is a reel, and a new value sends each reel two
 * turns on to its glyph, landing left to right. torph rolls digits but fades letters, and an
 * address is mostly letters. Without `spin`, a new value simply appears.
 */
export function Reels({ text, spin, still }: { text: string; spin: boolean; still: boolean }) {
  const [reel, setReel] = useState({ from: text, to: text, phase: "rest" as "rest" | "set" | "spin" });
  const last = useRef(text);

  // A new value: park each reel on the glyph it shows, then, a frame later, send it on.
  useLayoutEffect(() => {
    if (text === last.current) return;
    const from = last.current;
    last.current = text;
    setReel(spin && !still ? { from, to: text, phase: "set" } : { from: text, to: text, phase: "rest" });
  }, [text, spin, still]);

  useEffect(() => {
    if (reel.phase === "set") {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setReel((r) => ({ ...r, phase: "spin" })));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (reel.phase === "spin") {
      const t = window.setTimeout(() => setReel((r) => ({ from: r.to, to: r.to, phase: "rest" })), REEL_MS + reel.to.length * REEL_STAGGER + 120);
      return () => window.clearTimeout(t);
    }
  }, [reel]);

  return (
    <span className="dbg-reels">
      <span className="dbg-reels-row" aria-hidden="true">
        {reel.to.split("").map((c, i) => {
          // The 0x prefix never changes, so it never spins.
          const glyph = i < 2 ? -1 : GLYPHS.indexOf(c);
          if (glyph < 0) return <span key={i}>{c}</span>;
          const at = reel.phase === "spin" ? 2 * GLYPHS.length + glyph : reel.phase === "set" ? Math.max(0, GLYPHS.indexOf(reel.from[i] ?? "0")) : glyph;
          return (
            <span key={i} className="dbg-reel" data-spin={reel.phase === "spin" ? "" : undefined}>
              <span style={{ "--at": at, "--d": `${REEL_MS + i * REEL_STAGGER}ms` } as CSSProperties}>{STRIP}</span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

// ---- Marks ------------------------------------------------------------------------------------

export function UsdcMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path d="M10.3 9.2a9.4 9.4 0 0 0 0 13.6M21.7 9.2a9.4 9.4 0 0 1 0 13.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M16 8.9v1.5m0 11.2v1.5m2.9-11a3.2 3.2 0 0 0-2.9-1.7c-1.8 0-3.1 1-3.1 2.4 0 3.3 6.3 1.8 6.3 5.1 0 1.4-1.4 2.5-3.2 2.5a3.4 3.4 0 0 1-3.1-1.8"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BaseMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2.2" fill="#0000ff" />
    </svg>
  );
}

/** Whose an address is, as a mark: a logo, the user's avatar, a token's initial, or plainly unknown. */
export type Logo =
  | { kind: "usdc" | "base" | "you" | "unknown" }
  | { kind: "img"; src: string }
  | { kind: "letter"; letter: string; color: string };

export function LogoMark({ logo, address }: { logo?: Logo; address?: string }) {
  if (!logo) return <span className="dbg-mark" data-empty="" aria-hidden="true" />;
  if (logo.kind === "img") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="dbg-mark" src={logo.src} alt="" width={20} height={20} />;
  }
  if (logo.kind === "you" && address) {
    const h1 = (parseInt(address.slice(2, 4), 16) / 255) * 360;
    const h2 = (parseInt(address.slice(4, 6), 16) / 255) * 360;
    return (
      <span
        className="dbg-mark"
        aria-hidden="true"
        style={{ background: `linear-gradient(135deg, hsl(${h1} 78% 64%), hsl(${h2} 82% 58%))` }}
      />
    );
  }
  if (logo.kind === "letter") {
    return (
      <span className="dbg-mark" data-letter="" aria-hidden="true" style={{ background: logo.color }}>
        {logo.letter}
      </span>
    );
  }
  if (logo.kind === "unknown") {
    return (
      <span className="dbg-mark" data-unknown="" aria-hidden="true">
        ?
      </span>
    );
  }
  return <span className="dbg-mark">{logo.kind === "usdc" ? <UsdcMark /> : <BaseMark />}</span>;
}

export function Check({ ok }: { ok: boolean }) {
  return (
    <span className="dbg-check" data-ok={ok ? "" : undefined} role="img" aria-label={ok ? "as the app said" : "not as the app said"}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {ok ? (
          <path d="m3.8 8.4 2.7 2.6 5.7-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="m4.6 4.6 6.8 6.8m0-6.8-6.8 6.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

/** An address as people know it: a name and a mark, and whether it's who the app said. */
export type Named = { value: string; ok: boolean; logo: Logo; address: string };

// ---- Motion helpers -------------------------------------------------------------------------------

export function useReducedMotion() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return still;
}

/** True while at least a third of the element is on screen and the tab is visible. */
export function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let on = false;
    const sync = () => setInView(on && document.visibilityState === "visible");
    const io = new IntersectionObserver(
      ([entry]) => {
        on = entry.intersectionRatio >= 0.34 || entry.intersectionRect.height >= window.innerHeight * 0.55;
        sync();
      },
      { threshold: [0, 0.2, 0.34, 0.5, 0.75, 1] },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref]);
  return inView;
}

// ---- Fields ---------------------------------------------------------------------------------------

/** A name or label: a dash until read, then it morphs in, with its mark if it has one. */
export function Field({ value, read, bad, named, className }: { value: string; read: boolean; bad?: boolean; named?: Named; className?: string }) {
  return (
    <span className={`dbg-field ${className ?? ""}`} data-d={read ? "" : undefined} data-bad={bad ? "" : undefined}>
      {named ? <LogoMark logo={read ? named.logo : undefined} address={named.address} /> : null}
      <TextMorph className="dbg-field-text">{read ? value : DASH}</TextMorph>
    </span>
  );
}

// ---- The coin ---------------------------------------------------------------------------------------

/**
 * The token as the story's coin, in WebGL once three.js has loaded: a blank that turns into the
 * token when the debugger reads it (USDC, or `mint` for any other). Until then, and without WebGL,
 * a flat mark stands in. `mint` is read once, when the coin is built.
 */
export function Coin({ face, live, still, mint = null }: { face: Face; live: boolean; still: boolean; mint?: Mint | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<CoinStage | null>(null);
  const faceRef = useRef(face);
  faceRef.current = face;
  const mintRef = useRef(mint);
  const [ready, setReady] = useState(false);

  // Build the stage once the section is about a screen away.
  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    let gone = false;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      stageRef.current?.setSize(r.width, r.height);
    };
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        if (!document.createElement("canvas").getContext("webgl2")) return;
        (async () => {
          await document.fonts.ready;
          const { CoinStage } = await import("@/components/coin-stage");
          if (gone) return;
          try {
            const sans = getComputedStyle(document.documentElement).getPropertyValue("--font-archivo").trim() || "sans-serif";
            const stage = new CoinStage(canvas, sans, mintRef.current);
            stageRef.current = stage;
            fit();
            stage.show(faceRef.current, false);
            setReady(true);
          } catch {
            // No WebGL after all: the flat mark stays.
          }
        })();
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(box);
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => {
      gone = true;
      near.disconnect();
      ro.disconnect();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.show(face, !still);
  }, [face, still, ready]);

  useEffect(() => {
    stageRef.current?.setLive(live && !still);
  }, [live, still, ready]);

  return (
    <div ref={boxRef} className="dbg-coin" data-face={face} data-ready={ready ? "" : undefined}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="dbg-coin-flat" aria-hidden="true" style={mint ? { background: mint.color } : undefined}>
        {mint ? <span className="dbg-coin-letter">{mint.letter}</span> : <UsdcMark />}
      </span>
    </div>
  );
}
