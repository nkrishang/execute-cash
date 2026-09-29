"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { bytesToHex, getAddress, isAddressEqual, type Address } from "viem";
import { LogoMark, useInView, useReducedMotion, type Named } from "@/components/debugger-kit";
import { Bytes, Calls, Facts, Proof, TokenHero, stepsFor, type Action, type FieldName, type Reading, type Steps } from "@/components/debugger-view";
import { KNOWN_FACTORIES } from "@/lib/execute/derive";
import type { Story } from "@/lib/execute/describe";
import { chainName, formatClock, short } from "@/lib/execute/format";
import { chainLogo, knownContract, mintOf } from "@/lib/execute/known";
import type { Chain, ExecutableAddress } from "@/lib/execute/types";
import { derive, type Session } from "./session";

/*
 * An executable address, opened up, as the landing page opens its three deposits: the terms, encoded
 * again here from the intent the API served, read field by field and hashed in the browser, then
 * held against the address in the URL. It plays once when it comes into view; any byte can be
 * changed to see the address move.
 */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const readAddress = (b: Uint8Array, at: number) => getAddress(bytesToHex(b.subarray(at, at + 20)));
const readUint = (b: Uint8Array, at: number) => BigInt(bytesToHex(b.subarray(at, at + 32)));

/** How long each step holds, in ms: long enough for its value to land before the next one moves. */
function dwell(step: number, s: Steps) {
  if (step === 0) return 900;
  if (step === s.token || step === s.amount) return 1500;
  if (step < s.expiry) return 1800;
  if (step === s.salt) return 1300;
  if (step === s.hash) return 2200;
  return 1000;
}

/** What the debugger is doing, as its status bar says it. */
function phase(step: number, s: Steps, verified: boolean) {
  if (step === 0) return "Ready";
  if (step === s.token) return "Reading the token";
  if (step === s.amount) return "Reading the amount";
  if (step < s.expiry) return `Reading call ${step - s.call(0) + 1} of ${s.calls}`;
  if (step === s.expiry) return "Reading the expiry";
  if (step === s.recovery) return "Reading the refund address";
  if (step === s.salt) return "Reading the salt";
  if (step === s.chain) return "Reading the chain";
  if (step === s.hash) return "Hashing the terms";
  return verified ? "Verified" : "Mismatch";
}

export function AddressDebugger({ exe, session, story, chains }: { exe: ExecutableAddress; session: Session; story: Story; chains: Chain[] }) {
  const { intent } = exe;
  const steps = useMemo(() => stepsFor(session.calls.length), [session]);
  const still = useReducedMotion();
  const dbgRef = useRef<HTMLDivElement>(null);
  const inView = useInView(dbgRef);
  const [step, setStep] = useState(0);
  const [flips, setFlips] = useState<number[]>([]);

  // Reduced motion: the verdict, at once, and nothing moves by itself.
  useEffect(() => {
    if (still) setStep(steps.done);
  }, [still, steps]);

  // Once in view, each step holds for its dwell, then the next, up to the verdict. A changed byte stops it.
  const tampered = flips.length > 0;
  useEffect(() => {
    if (!inView || still || tampered || step >= steps.done) return;
    const t = window.setTimeout(() => setStep(step + 1), dwell(step, steps));
    return () => window.clearTimeout(t);
  }, [inView, still, tampered, step, steps]);

  const bytes = useMemo(() => {
    if (!flips.length) return session.terms;
    const b = session.terms.slice();
    for (const i of flips) b[i] ^= 1;
    return b;
  }, [session, flips]);

  const computed = useMemo(() => derive(session.factory, bytes), [session, bytes]);
  const trusted = KNOWN_FACTORIES.some((f) => isAddressEqual(f, session.factory));
  const verified = trusted && isAddressEqual(computed, session.address);

  // Which fields a changed byte touched.
  const touched = useMemo(() => {
    const out = new Set<FieldName>();
    for (const i of flips) {
      const mark = session.marks.find((m) => i >= m.from && i < m.to);
      if (mark) out.add(mark.field);
    }
    return out;
  }, [session, flips]);

  const reading = useMemo((): Reading => {
    const name = (address: Address, expect: string): Named => {
      const known = knownContract(chains, intent.chainId, address);
      return { value: known ? known.name : short(address), ok: same(address, expect), logo: known ? known.logo : { kind: "you" }, address };
    };
    const at = session.at;
    const amount = readUint(bytes, at.amount);
    const expiry = readUint(bytes, at.expiration);
    const chain = readUint(bytes, at.chainId);
    const salt = bytesToHex(bytes.subarray(at.salt, at.salt + 32));
    const chainId = chain <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(chain) : -1;
    return {
      token: name(readAddress(bytes, at.token), intent.token),
      amount: { value: amount, ok: amount === BigInt(intent.amount) },
      calls: session.calls.map((c, i) => {
        const selector = bytesToHex(bytes.subarray(c.selector, c.selector + 4));
        const sum = c.amount ? readUint(bytes, c.amount.at) : null;
        return {
          ok: !touched.has(`calls.${i}`) && !touched.has("calls"),
          verb: { value: selector === c.expectSelector ? c.name : selector, ok: selector === c.expectSelector },
          on: name(readAddress(bytes, c.target), c.expectTarget),
          amount: c.amount && sum !== null ? { value: sum, ok: sum === BigInt(c.amount.expect) } : null,
          to: c.to ? name(readAddress(bytes, c.to.at), c.to.expect) : null,
        };
      }),
      expiry: { value: formatClock(expiry)[0], sub: formatClock(expiry)[1], ok: expiry === BigInt(intent.expirationTimestamp) },
      recovery: name(readAddress(bytes, at.recovery), intent.recovery),
      salt: { value: short(salt), ok: same(salt, intent.salt) },
      chain: {
        value: chainId === intent.chainId ? story.chain : chainId >= 0 ? chainName(chainId) : "Not a chain",
        ok: chainId === intent.chainId,
        logo: chainLogo(chainId),
        address: "",
      },
    };
  }, [session, bytes, touched, chains, intent, story.chain]);

  /** Flips the lowest bit of a byte: the smallest change there is. */
  const flip = useCallback(
    (i: number) => {
      setFlips((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]));
      setStep(steps.done);
    },
    [steps],
  );

  /** The one-click change: the last byte of whoever the last call is for, or of the refund address. */
  const redirect = () => {
    const to = [...session.calls].reverse().find((c) => c.to)?.to;
    flip((to?.at ?? session.at.recovery) + 19);
  };

  const replay = () => {
    setFlips([]);
    setStep(still ? steps.done : 0);
  };

  const ok: Action[] = [
    { label: "Change one byte", onClick: redirect },
    { label: "Replay", onClick: replay },
  ];
  const bad = tampered
    ? { text: "A different address", actions: [{ label: "Undo", onClick: () => setFlips([]) }] }
    : { text: trusted ? "Not this address. Don’t send to it." : "Unknown factory. Don’t send to it.", actions: [] };

  const rows = Math.ceil(session.terms.length / 32);
  const barLogo = story.main?.protocol ? story.main.logo : (knownContract(chains, intent.chainId, intent.token)?.logo ?? { kind: "unknown" });

  return (
    <div
      ref={dbgRef}
      className="dbg ad-dbg"
      data-live={inView ? "" : undefined}
      style={{ "--rows": Math.min(rows, 28) } as CSSProperties}
    >
      <div className="dbg-aura" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="dbg-window">
        <div className="ad-bar" style={{ "--fill": step / steps.done } as CSSProperties}>
          <span className="ad-bar-id">
            <span className="ad-bar-logo">
              <LogoMark logo={barLogo} />
            </span>
            <span className="ad-bar-text">
              <span className="ad-bar-name">{story.main?.protocol?.name ?? `${story.symbol} on ${story.chain}`}</span>
              <span className="ad-bar-sub">
                {story.main?.protocol ? `${story.main.name} · ${story.chain}` : short(exe.address)}
              </span>
            </span>
          </span>
          <span className="ad-bar-end">
            <span className="ad-bar-phase" data-verdict={step >= steps.done ? (verified ? "ok" : "bad") : undefined} aria-live="polite">
              {phase(step, steps, verified)}
            </span>
            <button type="button" className="ad-replay" onClick={replay} aria-label="Replay the check">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.8v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
        <div className="dbg-body">
          <Bytes terms={session.terms} marks={session.marks} bytes={bytes} step={step} steps={steps} flips={flips} onFlip={flip} />
          <div className="dbg-read">
            <TokenHero reading={reading} decimals={story.decimals ?? 0} mint={mintOf(story.token)} step={step} steps={steps} live={inView} still={still} />
            <Calls reading={reading} decimals={story.decimals ?? 0} step={step} steps={steps} still={still} />
            <Facts reading={reading} step={step} steps={steps} still={still} />
          </div>
        </div>
        <Proof
          label="This address"
          address={session.address}
          computed={computed}
          ran={step >= steps.hash}
          verdict={step >= steps.done ? (verified ? "ok" : "bad") : undefined}
          still={still}
          ok={{ text: "Verified in your browser", actions: ok }}
          bad={bad}
        />
      </div>
    </div>
  );
}
