"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Logo } from "@/components/logo";
import { DOCS } from "@/lib/links";

const PROTOCOLS = [
  { name: "Morpho", blurb: "Curated USDC vaults", logo: "/protocols/morpho.png", color: "#2470ff", href: "/#morpho" },
  { name: "Spark", blurb: "The Sky Savings Rate", logo: "/protocols/spark.png", color: "#ff5a6e", href: "/#spark" },
  { name: "Aave", blurb: "USDC lending markets", logo: "/protocols/aave.svg", color: "#8f8cf5", href: "/#aave" },
];

/**
 * The site's bar. On the landing page "Get started" joins it once the hero's own has scrolled away
 * (`cta="scroll"`); pages without a hero keep it in the bar (`cta="always"`).
 */
export function Navbar({ cta: mode = "scroll" }: { cta?: "scroll" | "always" }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [joined, setJoined] = useState(false);
  const cta = mode === "always" || joined;
  const headerRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Content scrolls under the bar, so it gains a backdrop once the page moves.
  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 4);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  // The main call to action joins the bar once the hero's own has scrolled up under it,
  // and leaves again when the hero's comes back into view.
  useEffect(() => {
    const target = document.querySelector("[data-hero-cta]");
    const header = headerRef.current;
    if (mode !== "scroll" || !target || !header) return;
    const io = new IntersectionObserver(
      ([entry]) => setJoined(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)),
      { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [mode]);

  // The links slide aside by exactly its width.
  useEffect(() => {
    const el = ctaRef.current;
    const header = headerRef.current;
    if (!el || !header) return;
    const ro = new ResizeObserver(() => header.style.setProperty("--cta-w", `${el.offsetWidth}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="nav" data-scrolled={scrolled ? "" : undefined} data-cta={cta ? "" : undefined}>
      <div className="nav-inner">
        <Link href="/" className="nav-brand" aria-label="Execute">
          <Logo className="nav-logo" title="" aria-hidden="true" />
          <span className="nav-wordmark">execute</span>
        </Link>

        <div className="nav-end">
          <nav className="nav-links" aria-label="Main">
            <div
              ref={wrapRef}
              className="nav-menu"
              onPointerEnter={(e) => e.pointerType === "mouse" && openNow()}
              onPointerLeave={(e) => e.pointerType === "mouse" && closeSoon()}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
              }}
            >
              <button
                type="button"
                className="nav-link"
                aria-expanded={open}
                aria-controls="use-cases-menu"
                onClick={() => setOpen((o) => !o)}
              >
                Use cases
                <svg className="nav-chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div id="use-cases-menu" className="nav-panel" data-open={open ? "" : undefined}>
                <p className="nav-panel-title">Earn without connecting</p>
                <ul>
                  {PROTOCOLS.map((p) => (
                    <li key={p.name}>
                      <a
                        href={p.href}
                        className="nav-row"
                        style={{ "--brand": p.color } as CSSProperties}
                        onClick={() => setOpen(false)}
                      >
                        <span className="nav-row-logo" data-protocol={p.name.toLowerCase()}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.logo} alt="" width={28} height={28} />
                        </span>
                        <span className="nav-row-text">
                          <span className="nav-row-name">{p.name}</span>
                          <span className="nav-row-blurb">{p.blurb}</span>
                        </span>
                        <svg className="nav-row-arrow" viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <a href={DOCS.home} className="nav-link">
              Docs
            </a>
            <Link href="/dashboard" className="nav-link nav-link-app">
              Sign in
            </Link>
          </nav>

          <a
            ref={ctaRef}
            href="/dashboard"
            className="nav-cta"
            tabIndex={cta ? undefined : -1}
            aria-hidden={cta ? undefined : true}
          >
            Get started
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
