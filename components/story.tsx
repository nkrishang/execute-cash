"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { LENGTH, SCROLL, actOf, frame, progressAt, scrollAt, type View } from "@/components/story-scene";
import type { Fonts, Stage } from "@/components/story-stage";

/** The section after the hero: the wallet, the app, and sending instead of signing, told with hardware. */
const COPY = [
  {
    rail: "Wallet",
    title: ["A wallet is", "a *sandbox*."],
    body: "No asset leaves without its owner signing a transaction. A wallet can build secure transactions within its sandbox.",
  },
  {
    rail: "App",
    title: ["Connecting to", "apps is a *risk*."],
    body: "Connecting a wallet lets apps push transaction requests to the wallet. Signing the wrong transaction drains the wallet.",
    note: "Over $2 billion lost to signature phishing, approval exploits and sophisticated attacks on this surface area since 2020.",
  },
  {
    rail: "Send",
    title: ["*Send*,", "don\u2019t sign."],
    body: "An executable address is hardwired to route exact funds to apps. No approvals or wallet connections.",
  },
];

/** A title line, with its *key word* set as a highlight. */
function marked(line: string) {
  return line.split("*").map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

/** Where each act begins and ends, in progress units. */
const ACT_SPANS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, LENGTH],
];

/**
 * The scene never plays faster than this, in screens of story per second, so a hard flick still
 * leaves time to see each beat. Far behind (a jump to the end), it catches up faster.
 */
const PACE_LIMIT = 1.4;

/** The frame each act settles on: what reduced motion shows. */
const STILL_AT = [0.45, 1.9, LENGTH];

/** The page's own typefaces, for the screens printed inside the scene. */
function fonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  return { sans: css.getPropertyValue("--font-archivo").trim() || "sans-serif", mono: css.getPropertyValue("--font-recursive").trim() || "monospace" };
}

/** Loads three.js only when the section mounts, so the hero stays light. */
async function createStage(canvas: HTMLCanvasElement) {
  // No WebGL 2 (which three.js needs): skip the scene quietly; the copy still tells the story.
  if (!document.createElement("canvas").getContext("webgl2")) return null;
  await document.fonts.ready;
  const { Stage } = await import("@/components/story-stage");
  try {
    return new Stage(canvas, fonts());
  } catch {
    return null; // No WebGL: the copy still tells the story.
  }
}

export function Story() {
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return still ? <StillStory /> : <PinnedStory />;
}

/** The stage's size, and where the copy sits, for framing the scene beside it. */
function measure(stage: HTMLElement, copy: HTMLElement | null): View {
  const s = stage.getBoundingClientRect();
  const c = copy?.getBoundingClientRect();
  return { w: s.width, h: s.height, copyRight: c ? c.right - s.left : 0, copyTop: c ? c.top - s.top : s.height };
}

/**
 * Pins for about ten screens, paced beat by beat in story-scene.ts. Scrolling scrubs the scene,
 * backwards too, and the copy crossfades from act to act.
 */
function PinnedStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<SVGSVGElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  /** Until when a jump from the rail may skip the pace limit. */
  const jumpUntil = useRef(0);
  const [act, setAct] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const host = stageRef.current;
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const rail = railRef.current;
    if (!section || !host || !canvas || !cursor || !rail) return;

    let stage: Stage | null = null;
    let gone = false;
    let view = measure(host, copyRef.current);
    let target = 0;
    let shown = -1;
    let raf = 0;
    let last = 0;

    // Both in screens of scrolling; the pacing table turns them into story progress.
    const read = () => {
      const travel = section.offsetHeight - window.innerHeight;
      const scrolled = -section.getBoundingClientRect().top;
      target = Math.min(1, Math.max(0, scrolled / travel)) * SCROLL;
    };

    const paint = (s: number) => {
      const d = progressAt(s);
      rail.querySelectorAll("li").forEach((li, i) => {
        const [a, b] = ACT_SPANS[i];
        li.style.setProperty("--fill", String(Math.min(1, Math.max(0, (d - a) / (b - a)))));
      });
      setAct(actOf(d));
      if (!stage) return;
      const f = frame(d, view);
      stage.draw(f);
      if (f.cursor) {
        const [x, y] = stage.toScreen(f.cursor.at);
        cursor.style.opacity = String(f.cursor.o);
        cursor.style.transform = `translate(${x + f.cursor.offset[0]}px, ${y + f.cursor.offset[1]}px) scale(${1 - 0.12 * f.cursor.press})`;
      } else cursor.style.opacity = "0";
    };

    // The scene eases toward the scroll position, so wheel steps glide instead of jump, and
    // keeps to a watchable pace however hard the page is flicked.
    const tick = (now: number) => {
      raf = 0;
      // The easing steps are capped for stability; the pace limit counts real time, so slow devices keep up.
      const elapsed = last ? now - last : 16;
      last = now;
      if (shown < 0) shown = target;
      else {
        const gap = target - shown;
        const eased = gap * (1 - Math.exp(-Math.min(64, elapsed) / 90));
        const limit = now < jumpUntil.current ? Infinity : (Math.max(PACE_LIMIT, 0.6 * Math.abs(gap)) * elapsed) / 1000;
        shown += Math.max(-limit, Math.min(limit, eased));
      }
      if (Math.abs(target - shown) < 0.0005) shown = target;
      paint(shown);
      if (shown !== target) raf = requestAnimationFrame(tick);
      else last = 0;
    };

    const onScroll = () => {
      read();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const resize = new ResizeObserver(() => {
      view = measure(host, copyRef.current);
      stage?.setSize(view.w, view.h);
      if (shown >= 0) paint(shown);
      onScroll();
    });

    // Build the scene only once the section is about a screen away, so the hero loads as light as before.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        createStage(canvas).then((s) => {
          if (gone) {
            s?.dispose();
            return;
          }
          stage = s;
          stage?.setSize(view.w, view.h);
          shown = -1;
          onScroll();
        });
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(section);

    resize.observe(host);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      near.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      stage?.dispose();
    };
  }, []);

  const goTo = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const travel = section.offsetHeight - window.innerHeight;
    const top = section.getBoundingClientRect().top + window.scrollY;
    jumpUntil.current = performance.now() + 1500;
    window.scrollTo({ top: top + (scrollAt(ACT_SPANS[i][0] + 0.02) / SCROLL) * travel, behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="story" style={{ "--story-length": SCROLL + 1 } as CSSProperties}>
      <div ref={stageRef} className="story-pin">
        <canvas ref={canvasRef} className="story-canvas" aria-hidden="true" />
        <svg ref={cursorRef} className="story-cursor" viewBox="0 0 17 24" aria-hidden="true">
          <path d="M1.5 1.5v18.4l4.6-4.4 3.1 7 3.3-1.4-3-6.9h6.3L1.5 1.5Z" />
        </svg>
        <div className="story-frame">
          <div ref={copyRef} className="story-copy">
            <div className="story-scenes">
              {COPY.map((c, i) => (
                <Scene key={c.rail} copy={c} state={i === act ? "on" : i < act ? "past" : "next"} />
              ))}
            </div>
            <ol ref={railRef} className="story-rail" aria-label="Story">
              {COPY.map((c, i) => (
                <li key={c.rail}>
                  <button type="button" onClick={() => goTo(i)} aria-current={i === act ? "step" : undefined}>
                    <span className="story-rail-n">0{i + 1}</span>
                    {c.rail}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Reduced motion: each act as a still, rendered once. */
function StillStory() {
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const copies = useRef<(HTMLDivElement | null)[]>([]);
  const [shots, setShots] = useState<string[]>([]);

  useEffect(() => {
    let gone = false;
    const canvas = document.createElement("canvas");
    createStage(canvas).then((stage) => {
      if (!stage || gone) return stage?.dispose();
      const out = STILL_AT.map((p, i) => {
        const panel = panels.current[i];
        if (!panel) return "";
        const view = measure(panel, copies.current[i]);
        stage.setSize(view.w, view.h);
        stage.draw(frame(p, view));
        return canvas.toDataURL("image/png");
      });
      stage.dispose();
      setShots(out);
    });
    return () => {
      gone = true;
    };
  }, []);

  return (
    <section className="story-still">
      {COPY.map((c, i) => (
        <div
          key={c.rail}
          ref={(el) => {
            panels.current[i] = el;
          }}
          className="story-still-panel"
        >
          {shots[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shots[i]} alt="" className="story-canvas" />
          ) : null}
          <div className="story-frame">
            <div
              ref={(el) => {
                copies.current[i] = el;
              }}
              className="story-copy"
            >
              <Scene copy={c} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function Scene({ copy, state }: { copy: (typeof COPY)[number]; state?: "on" | "past" | "next" }) {
  return (
    <article className="story-scene" data-state={state}>
      <h2>
        {copy.title.map((line, i) => (
          <Fragment key={line}>
            {i ? " " : null}
            <span>{marked(line)}</span>
          </Fragment>
        ))}
      </h2>
      <p>{copy.body}</p>
      {copy.note ? <p className="story-note">{copy.note}</p> : null}
    </article>
  );
}
