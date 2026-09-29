"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useInView, useReducedMotion, type Logo, type Named } from "@/components/debugger-kit";
import { Bytes, Calls, Facts, Proof, TokenHero, stepsFor, type Reading } from "@/components/debugger-view";
import { DOCS } from "@/lib/links";
import {
  AMOUNT,
  CHAIN_ID,
  CHAINS,
  EXPIRY,
  FUNCTIONS,
  SESSIONS,
  USDC,
  YOU,
  derive,
  formatDay,
  identify,
  readAddress,
  readUint,
  short,
  toHex,
  type Session,
} from "@/components/verify-terms";

/*
 * The section after the story: an executable address, opened up. Its raw terms run down the left;
 * on the right, every field waits as a placeholder of its own kind and fills in as the section
 * reaches it: amounts count up from 0.00, hex spins in from zeros like slot reels, names and labels
 * morph in (torph). Then the terms are hashed, in the browser, and the result is held against the
 * address the app showed. Three real deposits on Base, one per tab. Any byte can be changed to
 * break the match.
 */

/** Every deposit here makes two calls: approve, then deposit or supply. */
const STEPS = stepsFor(2);

/** How long each step holds, in ms: long enough for its value to land before the next one moves. */
const DWELL = [1100, 1700, 1700, 2000, 2100, 1000, 1000, 1200, 1000, 2400, 5200];

// ---- Reading the terms --------------------------------------------------------------------------

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function who(address: string, expect: string): Named {
  const known = identify(address);
  const logo: Logo = !known
    ? { kind: "unknown" }
    : known.logo === "usdc"
      ? { kind: "usdc" }
      : known.logo === "you"
        ? { kind: "you" }
        : { kind: "img", src: known.logo! };
  return { value: known ? known.name : `Unknown ${short(address)}`, ok: same(address, expect), logo, address };
}

/** Reads every field back out of the bytes, as people would say it, and checks it against what the app said. */
function read(session: Session, b: Uint8Array): Reading {
  const amount = readUint(b, session.at.amount);
  const expiry = readUint(b, session.at.expiration);
  const chain = readUint(b, session.at.chainId);
  const salt = `0x${toHex(b.subarray(session.at.salt, session.at.salt + 32))}`;
  const issuedSalt = `0x${toHex(session.terms.subarray(session.at.salt, session.at.salt + 32))}`;

  const calls = session.calls.map((c) => {
    const selector = toHex(b.subarray(c.selector, c.selector + 4));
    const fn = FUNCTIONS[selector];
    const args = c.args.map((a) => ({ ...a, value: a.type === "address" ? readAddress(b, a.at) : readUint(b, a.at) }));
    // Every call here moves an amount of USDC to someone: the spender, the receiver, or whoever the supply is on behalf of.
    const sum = args.find((a) => a.type === "uint256")!;
    const to = args.find((a) => a.name === "spender" || a.name === "receiver" || a.name === "onBehalfOf")!;
    const target = readAddress(b, c.target);
    return {
      ok:
        same(target, c.expect.target) &&
        selector === c.expect.selector &&
        args.every((a) => (typeof a.value === "string" ? same(a.value, a.expect as string) : a.value === a.expect)),
      verb: { value: fn ? fn.name : `0x${selector}`, ok: selector === c.expect.selector },
      on: who(target, c.expect.target),
      amount: { value: sum.value as bigint, ok: sum.value === sum.expect },
      to: who(to.value as string, to.expect as string),
    };
  });

  const chainName = CHAINS[chain.toString()];
  return {
    token: who(readAddress(b, session.at.token), USDC),
    amount: { value: amount, ok: amount === AMOUNT },
    calls,
    expiry: { value: formatDay(expiry)[0], ok: expiry === EXPIRY },
    recovery: who(readAddress(b, session.at.recovery), YOU),
    salt: { value: short(salt), ok: salt === issuedSalt },
    chain: { value: chainName ?? chain.toString(), ok: chain === CHAIN_ID, logo: { kind: chainName ? "base" : "unknown" }, address: "" },
  };
}

// ---- The section ----------------------------------------------------------------------------------

export function Verify() {
  const still = useReducedMotion();
  const dbgRef = useRef<HTMLDivElement>(null);
  const inView = useInView(dbgRef);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [flips, setFlips] = useState<number[]>([]);
  /** While the pointer rests on the window, a finished tab waits instead of moving on. */
  const [hold, setHold] = useState(false);

  const session = SESSIONS[index];

  // Reduced motion: every tab shows its verdict, and nothing moves by itself.
  useEffect(() => {
    if (still) setStep(STEPS.done);
  }, [still]);

  const select = useCallback(
    (i: number) => {
      setIndex(i);
      setFlips([]);
      setStep(still ? STEPS.done : 0);
    },
    [still],
  );

  // The navbar's Morpho, Spark and Aave links land here, on their tab.
  useEffect(() => {
    const sync = () => {
      const i = SESSIONS.findIndex((s) => `#${s.id}` === window.location.hash);
      if (i >= 0) select(i);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [select]);

  // Hold each step for its dwell, then the next; after the verdict, the next tab. A changed byte stops it.
  const tampered = flips.length > 0;
  useEffect(() => {
    if (!inView || still || tampered || (step >= STEPS.done && hold)) return;
    const t = window.setTimeout(() => {
      if (step < STEPS.done) setStep(step + 1);
      else select((index + 1) % SESSIONS.length);
    }, DWELL[step]);
    return () => window.clearTimeout(t);
  }, [inView, still, tampered, hold, step, index, select]);

  const bytes = useMemo(() => {
    if (!flips.length) return session.terms;
    const b = session.terms.slice();
    for (const i of flips) b[i] ^= 1;
    return b;
  }, [session, flips]);
  const computed = useMemo(() => derive(bytes), [bytes]);
  const reading = useMemo(() => read(session, bytes), [session, bytes]);

  /** Flips the lowest bit of a byte: the smallest change there is. */
  const flip = useCallback((i: number) => {
    setFlips((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]));
    setStep(STEPS.done);
  }, []);

  /** The one-click change: the last byte of whoever the deposit is for. */
  const redirect = () => {
    const last = session.calls[session.calls.length - 1];
    const to = last.args.find((a) => a.name === "receiver" || a.name === "onBehalfOf");
    if (to) flip(to.at + 19);
  };

  return (
    <section id="use-cases" className="verify dbg-theme" data-theme={session.id} aria-labelledby="verify-title">
      <div className="verify-inner">
        <header className="verify-head">
          <h2 id="verify-title" className="verify-title">
            <span>What you see</span> <span>is what <mark>executes</mark>.</span>
          </h2>
          <p className="verify-lede">
            An executable address is computed from its terms: the token, the exact amount and every call it will
            make. Anyone can recompute it before sending. Change a single byte and you get a different address.
          </p>
        </header>

        <div className="verify-cta-row">
          <a className="verify-cta" href={DOCS.guides}>
            <span className="verify-cta-text verify-cta-full">
              Read how <mark>Execute API</mark> enables deposits into{" "}
              {SESSIONS.map((s, i) => (
                <Fragment key={s.id}>
                  <span className="verify-cta-protocol" data-protocol={s.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logo} alt="" width={20} height={20} />
                    {s.protocol}
                  </span>
                  {i < SESSIONS.length - 2 ? ", " : i === SESSIONS.length - 2 ? " and " : " "}
                </Fragment>
              ))}
              without connecting wallets or approving tokens
            </span>
            {/* Phones: the sentence shrinks to a title and the three logos. */}
            <span className="verify-cta-text verify-cta-short">
              <mark>Execute API</mark> for vaults
              <span className="verify-cta-logos" aria-label={SESSIONS.map((s) => s.protocol).join(", ")} role="img">
                {SESSIONS.map((s) => (
                  <span key={s.id} className="verify-cta-protocol" data-protocol={s.id} aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logo} alt="" width={20} height={20} />
                  </span>
                ))}
              </span>
            </span>
            <span className="verify-cta-arrow" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
        </div>

        <div
          ref={dbgRef}
          className="dbg"
          data-live={inView ? "" : undefined}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
          onPointerLeave={() => setHold(false)}
        >
          <div className="dbg-aura" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="dbg-window">
            <Tabs index={index} step={step} onSelect={select} />
            <div className="dbg-body" role="tabpanel" id="dbg-panel" aria-labelledby={session.id}>
              <Bytes
                key={session.id}
                terms={session.terms}
                marks={session.marks}
                bytes={bytes}
                step={step}
                steps={STEPS}
                flips={flips}
                onFlip={flip}
              />
              <div className="dbg-read">
                <TokenHero reading={reading} step={step} steps={STEPS} live={inView} still={still} />
                <Calls reading={reading} step={step} steps={STEPS} still={still} />
                <Facts reading={reading} step={step} steps={STEPS} still={still} />
              </div>
            </div>
            <Proof
              label="Your app shows"
              address={session.address}
              computed={computed}
              ran={step >= STEPS.hash}
              verdict={step >= STEPS.done ? (tampered ? "bad" : "ok") : undefined}
              still={still}
              ok={{ text: "Verified in your browser", actions: [{ label: "Change one byte", onClick: redirect }] }}
              bad={{ text: "A different address", actions: [{ label: "Undo", onClick: () => setFlips([]) }] }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Tabs -------------------------------------------------------------------------------------------

function Tabs({ index, step, onSelect }: { index: number; step: number; onSelect: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      className="dbg-tabs"
      role="tablist"
      aria-label="Integrations"
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = (index + d + SESSIONS.length) % SESSIONS.length;
        onSelect(next);
        refs.current[next]?.focus();
      }}
    >
      {SESSIONS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={s.id}
          className="dbg-tab"
          data-protocol={s.id}
          aria-selected={i === index}
          aria-controls="dbg-panel"
          tabIndex={i === index ? 0 : -1}
          onClick={() => onSelect(i)}
          style={{ "--fill": i === index ? step / STEPS.done : 0 } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.logo} alt="" width={32} height={32} />
          <span className="dbg-tab-text">
            <span className="dbg-tab-name">{s.protocol}</span>
            <span className="dbg-tab-vault">{s.vault}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
