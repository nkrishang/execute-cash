import type { ReactNode } from "react";
import { DOCS } from "@/lib/links";

const PILL_LOGOS = [
  { src: "/protocols/morpho.png", name: "morpho" },
  { src: "/protocols/spark.png", name: "spark" },
  { src: "/protocols/aave.svg", name: "aave" },
];

const Arrow = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The landing hero: "Never [button]". Pages supply the button. */
export function Hero({ button }: { button: ReactNode }) {
  return (
    <section className="hero">
      <a href="#use-cases" className="hero-pill">
        <span className="hero-pill-logos" aria-hidden="true">
          {PILL_LOGOS.map((l) => (
            <span key={l.name} className="hero-pill-logo" data-protocol={l.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.src} alt="" width={20} height={20} />
            </span>
          ))}
        </span>
        <span>Integrations for Morpho, Spark and Aave</span>
        <Arrow />
      </a>

      <div className="hero-line">
        <h1 className="hero-never">
          <span aria-hidden="true">Never</span>
          <span className="sr-only">Never connect your wallet.</span>
        </h1>
        {button}
      </div>

      <p className="hero-sub">
        Infrastructure for apps to let users earn onchain without wallet connections, token approvals or bridging.
      </p>

      <div className="hero-ctas" data-hero-cta>
        <a href="/dashboard" className="cta-primary">
          Get started
          <Arrow />
        </a>
        <a href={DOCS.home} className="cta-secondary">
          Read the docs
        </a>
      </div>
    </section>
  );
}
