"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { DOCS } from "@/lib/links";

/** The landing page's bar, signed in: the docs, and the account with its way out. */
export function AppNav({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Content scrolls under the bar, so it gains a backdrop once the page moves.
  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 4);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const initial = (email?.[0] ?? "·").toUpperCase();

  return (
    <header className="nav" data-scrolled={scrolled ? "" : undefined}>
      <div className="nav-inner">
        <Link href="/" className="nav-brand" aria-label="Execute">
          <Logo className="nav-logo" title="" aria-hidden="true" />
          <span className="nav-wordmark">execute</span>
        </Link>

        <nav className="nav-links" aria-label="Account">
          <a href={DOCS.home} className="nav-link">
            Docs
          </a>
          <div
            ref={menuRef}
            className="nav-menu"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
            }}
          >
            <button
              type="button"
              className="nav-link nav-account"
              aria-expanded={open}
              aria-controls="account-menu"
              aria-label="Account"
              onClick={() => setOpen((o) => !o)}
            >
              <span className="nav-avatar" aria-hidden="true">
                {initial}
              </span>
              {email && <span className="nav-email">{email}</span>}
              <svg className="nav-chevron" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id="account-menu" className="nav-panel nav-panel-account" data-open={open ? "" : undefined}>
              <p className="nav-panel-title">Signed in as</p>
              <p className="nav-account-email">{email ?? "your account"}</p>
              <button
                type="button"
                className="nav-signout"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                Sign out
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6.5 3H4.2C3.5 3 3 3.5 3 4.2v7.6c0 .7.5 1.2 1.2 1.2h2.3M10 5l3 3-3 3M13 8H6.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
