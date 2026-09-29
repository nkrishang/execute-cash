import Link from "next/link";
import { FlowButton } from "@/components/flow-button";
import { DOCS } from "@/lib/links";

const Arrow = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The close of an address page: the landing page's hero, small. */
export function Close() {
  return (
    <section className="ad-close" aria-labelledby="ad-close-title">
      <div className="hero-line">
        <h2 id="ad-close-title" className="hero-never">
          <span aria-hidden="true">Never</span>
          <span className="sr-only">Never connect your wallet.</span>
        </h2>
        <FlowButton />
      </div>

      <p className="hero-sub">
        Infrastructure for apps to let users earn onchain without wallet connections, token approvals or bridging.
      </p>

      <div className="hero-ctas">
        <a href="/dashboard" className="cta-primary">
          Get started
          <Arrow />
        </a>
        <Link href={DOCS.howItWorks} className="cta-secondary">
          How it works
        </Link>
      </div>
    </section>
  );
}
