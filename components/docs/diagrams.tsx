import type { ReactNode } from "react";
import { UsdcMark } from "@/components/debugger-kit";
import { Logo } from "@/components/logo";
import { VAULT_EXAMPLE } from "@/lib/docs";

/*
 * How it works, drawn: an intent as the route money takes, a payment from transfer to settlement,
 * and where funds go when an intent can't run.
 */

function Node({ icon, title, sub, tone }: { icon: ReactNode; title: string; sub?: string; tone?: "address" | "vault" | "you" }) {
  return (
    <div className="dia-node" data-tone={tone}>
      <span className="dia-node-icon">{icon}</span>
      <span className="dia-node-text">
        <span className="dia-node-title">{title}</span>
        {sub && <span className="dia-node-sub">{sub}</span>}
      </span>
    </div>
  );
}

function Edge({ label }: { label: string }) {
  return (
    <div className="dia-edge" aria-hidden="true">
      <span className="dia-edge-label">{label}</span>
      <span className="dia-edge-line" />
    </div>
  );
}

const Wallet = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3.5 6.5A2 2 0 0 1 5.5 4.5h9v3M3.5 6.5v8a2 2 0 0 0 2 2h11v-9h-11a2 2 0 0 1-2-2Z M13.5 12h.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

const Vault = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3.5 7.5 10 3.5l6.5 4M4.5 8v6.5M8 8v6.5M12 8v6.5M15.5 8v6.5M3 16.5h14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TERMS: [string, ReactNode][] = [
  ["token", "USDC"],
  ["amount", "100 USDC"],
  [
    "calls",
    <>
      <span>1. approve(vault, 100 USDC)</span>
      <span>2. deposit(100 USDC, your wallet)</span>
    </>,
  ],
  ["recovery", "your wallet"],
  ["chainId", "8453 (Base)"],
];

/** Deposit 100 USDC into an ERC-4626 vault, and send the shares to the user’s wallet: the route, and the intent that fixes it. */
export function IntentDiagram() {
  return (
    <figure className="dia dia-intent" aria-label="An intent: 100 USDC from your wallet to an executable address, into an ERC-4626 vault, and the vault's shares back to your wallet">
      <div className="dia-flow">
        <Node icon={<Wallet />} title="Your wallet" tone="you" />
        <Edge label="100 USDC" />
        <Node icon={<Logo title="" aria-hidden="true" />} title="Executable address" sub={`${VAULT_EXAMPLE.address.slice(0, 6)}…${VAULT_EXAMPLE.address.slice(-4)}`} tone="address" />
        <Edge label="approve, deposit" />
        <Node icon={<Vault />} title="ERC-4626 vault" tone="vault" />
        <Edge label="shares" />
        <Node icon={<Wallet />} title="Your wallet" tone="you" />
      </div>
      <figcaption className="dia-terms">
        <span className="dia-terms-title">The intent</span>
        <dl>
          {TERMS.map(([field, value]) => (
            <div key={field}>
              <dt>{field}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

const STAGES: { title: string; body: ReactNode; icon: ReactNode }[] = [
  {
    title: "Pay",
    body: "You send exactly 100 USDC to the address, with an ordinary transfer from any wallet or exchange.",
    icon: (
      <span className="dia-usdc">
        <UsdcMark />
      </span>
    ),
  },
  {
    title: "Detect",
    body: "Execute sees the transfer land and waits for it to confirm.",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "Execute",
    body: (
      <>
        Execute calls{" "}
        <code>
          PaymentFactory.
          <wbr />
          execute
        </code>
        , which deploys <code>Payment</code> at the address. Its constructor makes the calls.
      </>
    ),
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M11 2.5 4.5 11H10l-1 6.5L15.5 9H10l1-6.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Settle",
    body: "The transaction confirms. The vault’s shares are in your wallet, and the address is spent.",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 10.5 3.2 3 6.8-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** A payment, from transfer to settlement. */
export function FlowDiagram() {
  return (
    <figure className="dia" aria-label="From payment to execution">
      <ol className="dia-stages">
        {STAGES.map((s, i) => (
          <li key={s.title} className="dia-stage">
            <span className="dia-stage-icon">{s.icon}</span>
            <span className="dia-stage-n">{String(i + 1).padStart(2, "0")}</span>
            <span className="dia-stage-title">{s.title}</span>
            <span className="dia-stage-body">{s.body}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const CASES: { when: string; then: ReactNode }[] = [
  { when: "Too much", then: "Everything above the amount goes to recovery, and the calls run with exactly the amount." },
  { when: "Too little", then: "The address waits for the rest. If it’s still short at expiry, everything goes to recovery." },
  { when: "Too late", then: "After expiry, no call runs: the whole balance goes to recovery." },
  { when: "A call fails", then: "Nothing happens: the calls run together or not at all. Execute retries until expiry, then refunds." },
  { when: "Another chain", then: "Executed on a chain the intent doesn’t name, the address sends its whole balance to recovery." },
  {
    when: "Another token",
    then: (
      <>
        Once the address is deployed, anyone can call <code>recover(token)</code>, which sends that token to recovery.
      </>
    ),
  },
];

/** Where funds go when the intent can’t run as written. */
export function RecoveryDiagram() {
  return (
    <figure className="dia" aria-label="Recovery: where funds go when the intent can't run">
      <div className="dia-recovery">
        <div className="dia-recovery-ends">
          <Node icon={<Logo title="" aria-hidden="true" />} title="Executable address" tone="address" />
          <Edge label="whatever can’t be spent" />
          <Node icon={<Wallet />} title="recovery" sub="usually your wallet" tone="you" />
        </div>
        <dl className="dia-cases">
          {CASES.map((c) => (
            <div key={c.when} className="dia-case">
              <dt>{c.when}</dt>
              <dd>{c.then}</dd>
            </div>
          ))}
        </dl>
      </div>
    </figure>
  );
}
