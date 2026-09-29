"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Face, Mint } from "@/components/coin-stage";
import { Check, Coin, DASH, Field, Money, Reels, ZERO_ADDRESS, type Named } from "@/components/debugger-kit";

/*
 * The debugger's window, shared by the landing page's verify section and every address page: an
 * executable address's raw terms on one side, what they say on the other, and below, the address
 * recomputed from them. The two pages differ only in where their terms come from and how they name
 * what they find.
 *
 * Fields are read one step at a time, in the order `paymentAddress` takes them: the token, the
 * amount, each call, the expiry, the recovery address, the salt and the chain. Then the terms are
 * hashed, and the verdict follows.
 */

// ---- Terms and steps ------------------------------------------------------------------------------

export type FieldName = "token" | "amount" | "calls" | `calls.${number}` | "expiration" | "recovery" | "salt" | "chainId";

/**
 * A run of bytes in the terms. `value` bytes carry a parameter; `meta` bytes are the ABI's own
 * bookkeeping (offsets, lengths, padding); `selector` bytes name the function a call runs.
 * The calls' shared bookkeeping belongs to `calls`, read with every call.
 */
export type Mark = { field: FieldName; kind: "value" | "meta" | "selector"; from: number; to: number };

/** Which step reads what, for terms with `calls` calls. Step 0 is the entry, before anything is read. */
export function stepsFor(calls: number) {
  const expiry = 3 + calls;
  return {
    calls,
    token: 1,
    amount: 2,
    call: (i: number) => 3 + i,
    expiry,
    recovery: expiry + 1,
    salt: expiry + 2,
    chain: expiry + 3,
    hash: expiry + 4,
    done: expiry + 5,
  };
}

export type Steps = ReturnType<typeof stepsFor>;

/** The steps that read a run of bytes. */
function readsOf(field: FieldName, s: Steps): number[] {
  switch (field) {
    case "token":
      return [s.token];
    case "amount":
      return [s.amount];
    case "calls":
      return Array.from({ length: s.calls }, (_, i) => s.call(i));
    case "expiration":
      return [s.expiry];
    case "recovery":
      return [s.recovery];
    case "salt":
      return [s.salt];
    case "chainId":
      return [s.chain];
    default:
      return [s.call(Number(field.slice("calls.".length)))];
  }
}

/** Where a field stands: not reached, being read, or read. */
export const stateOf = (fieldStep: number, step: number, s: Steps) =>
  step >= s.hash || fieldStep < step ? "done" : fieldStep === step ? "on" : undefined;

// ---- What the terms say ----------------------------------------------------------------------------

export type Sum = { value: bigint; ok: boolean };
/** A value as read, whether it's as issued, and optionally a smaller line beneath it. */
export type Text = { value: string; ok: boolean; sub?: string };

/** A call as one standard row: what it calls, on which contract, how much, and for whom (when it says). */
export type CallRow = { ok: boolean; verb: Text; on: Named; amount: Sum | null; to: Named | null };

/** Every field, read back out of the bytes as people would say it, and checked against what was issued. */
export type Reading = {
  token: Named;
  amount: Sum;
  calls: CallRow[];
  expiry: Text;
  recovery: Named;
  salt: Text;
  chain: Named;
};

const ZERO_SALT = `0x0000…0000`;

// ---- The bytes ----------------------------------------------------------------------------------------

export function Bytes({
  terms,
  marks,
  bytes,
  step,
  steps,
  flips,
  onFlip,
}: {
  terms: Uint8Array;
  marks: Mark[];
  bytes: Uint8Array;
  step: number;
  steps: Steps;
  flips: number[];
  onFlip: (i: number) => void;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(32);
  const [scroll, setScroll] = useState(0);

  // 32 bytes to a row, one ABI word each. Stacked on a narrow screen, 16 where 32 don't fit.
  useEffect(() => {
    const body = paneRef.current?.parentElement;
    if (!body) return;
    const ro = new ResizeObserver(() => {
      const stacked = getComputedStyle(body).gridTemplateColumns.trim().split(/\s+/).length < 2;
      setPerRow(!stacked || body.clientWidth >= 560 ? 32 : 16);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  // Which run of bytes each byte belongs to, and the steps that read it.
  const owner = useMemo(() => {
    const out: { mark: Mark; reads: number[] }[] = new Array(terms.length);
    for (const mark of marks) {
      const reads = readsOf(mark.field, steps);
      for (let i = mark.from; i < mark.to; i++) out[i] = { mark, reads };
    }
    return out;
  }, [terms, marks, steps]);

  const active = step >= 1 && step < steps.hash ? step : 0;
  const first = active ? marks.find((m) => m.kind !== "meta" && m.field !== "calls" && readsOf(m.field, steps).includes(active)) : undefined;
  const pointer = first ? Math.floor(first.from / perRow) : -1;
  const rows = Math.ceil(bytes.length / perRow);

  // Where rows don't all fit, keep the one being read in view.
  useEffect(() => {
    const view = viewRef.current;
    const row = view?.querySelector<HTMLElement>(".dbg-row");
    if (!view || !row) return;
    const visible = Math.floor(view.clientHeight / row.offsetHeight);
    const target = pointer < 0 ? (step >= steps.hash ? rows - visible : 0) : pointer - Math.floor(visible / 3);
    setScroll(Math.max(0, Math.min(rows - visible, target)));
  }, [pointer, rows, step, steps, perRow]);

  const flipped = new Set(flips);

  return (
    <div ref={paneRef} className="dbg-pane dbg-bytes">
      <div className="dbg-pane-head">
        <span>Terms</span>
        <span className="dbg-pane-meta">{bytes.length} bytes</span>
      </div>
      <div
        ref={viewRef}
        className="dbg-hex-view"
        title="Click any byte to change it"
        onClick={(e) => {
          const i = (e.target as HTMLElement).dataset.i;
          if (i !== undefined) onFlip(Number(i));
        }}
      >
        <div className="dbg-hex" style={{ "--scroll": scroll } as CSSProperties} data-hashing={step === steps.hash ? "" : undefined} aria-hidden="true">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="dbg-row" data-pointer={r === pointer ? "" : undefined} style={{ "--r": r } as CSSProperties}>
              <span className="dbg-offset">{(r * perRow).toString(16).padStart(3, "0")}</span>
              <span className="dbg-cells">
                {Array.from({ length: Math.min(perRow, bytes.length - r * perRow) }, (_, k) => {
                  const i = r * perRow + k;
                  const { mark, reads } = owner[i];
                  const state = step >= steps.hash ? "done" : reads.includes(step) ? "on" : Math.max(...reads) < step ? "done" : undefined;
                  return (
                    <span
                      key={k}
                      data-i={i}
                      data-s={state}
                      data-k={mark.kind === "value" ? undefined : mark.kind}
                      data-z={bytes[i] === 0 ? "" : undefined}
                      data-x={flipped.has(i) ? "" : undefined}
                      data-g={k % 4 === 3 && k !== perRow - 1 ? "" : undefined}
                    >
                      {bytes[i].toString(16).padStart(2, "0")}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- What the bytes say -----------------------------------------------------------------------------

/** The token and the amount, which every executable address has: the coin, and the figure. */
export function TokenHero({
  reading,
  decimals,
  mint,
  step,
  steps,
  live,
  still,
}: {
  reading: Reading;
  decimals?: number;
  mint?: Mint | null;
  step: number;
  steps: Steps;
  live: boolean;
  still: boolean;
}) {
  const token = stateOf(steps.token, step, steps);
  const amount = stateOf(steps.amount, step, steps);
  const face: Face = token && reading.token.ok ? "token" : "blank";
  return (
    <div className="dbg-hero" data-s={token === "on" || amount === "on" ? "on" : amount ? "done" : undefined}>
      <Coin face={face} live={live} still={still} mint={mint} />
      <div className="dbg-hero-text">
        <Money
          className="dbg-hero-amount"
          value={reading.amount.value}
          decimals={decimals}
          read={!!amount}
          bad={!!amount && !reading.amount.ok}
          still={still}
          ms={1100}
        />
        <Field className="dbg-hero-symbol" value={reading.token.value} read={!!token} bad={!!token && !reading.token.ok} />
      </div>
    </div>
  );
}

/** Each call as one standard row: what it calls, on which contract, how much, and to whom. */
export function Calls({ reading, decimals, step, steps, still }: { reading: Reading; decimals?: number; step: number; steps: Steps; still: boolean }) {
  return (
    <div className="dbg-calls" role="table" aria-label="Calls">
      <div className="dbg-calls-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Call</span>
        <span role="columnheader">On</span>
        <span role="columnheader">Amount</span>
        <span role="columnheader">To</span>
      </div>
      {reading.calls.map((c, i) => {
        const state = stateOf(steps.call(i), step, steps);
        const read = !!state;
        return (
          <div key={i} className="dbg-call" data-s={state} data-bad={read && !c.ok ? "" : undefined} role="row">
            <span className="dbg-call-n" role="cell">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span role="cell">
              <Field className="dbg-verb" value={c.verb.value} read={read} bad={read && !c.verb.ok} />
            </span>
            <span role="cell">
              <Field value={c.on.value} read={read} bad={read && !c.on.ok} named={c.on} />
            </span>
            <span role="cell">
              {c.amount ? (
                <Money className="dbg-field dbg-sum" value={c.amount.value} decimals={decimals} read={read} bad={read && !c.amount.ok} still={still} ms={700} />
              ) : (
                <span className="dbg-field dbg-none">{DASH}</span>
              )}
            </span>
            <span role="cell">
              {c.to ? <Field value={c.to.value} read={read} bad={read && !c.to.ok} named={c.to} /> : <span className="dbg-field dbg-none">{DASH}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The rest of the terms: when it expires, where refunds go, what makes it unique, where it settles. */
export function Facts({ reading, step, steps, still }: { reading: Reading; step: number; steps: Steps; still: boolean }) {
  const expires = stateOf(steps.expiry, step, steps);
  const refunds = stateOf(steps.recovery, step, steps);
  const salt = stateOf(steps.salt, step, steps);
  const chain = stateOf(steps.chain, step, steps);
  return (
    <dl className="dbg-facts">
      <div className="dbg-fact" data-s={expires} data-bad={expires && !reading.expiry.ok ? "" : undefined}>
        <dt>Expires</dt>
        <dd>
          <Field value={reading.expiry.value} read={!!expires} />
          {reading.expiry.sub !== undefined && <span className="dbg-fact-sub">{expires ? reading.expiry.sub : "\u00a0"}</span>}
        </dd>
      </div>
      <div className="dbg-fact" data-s={refunds} data-bad={refunds && !reading.recovery.ok ? "" : undefined}>
        <dt>Refunds to</dt>
        <dd>
          <Field value={reading.recovery.value} read={!!refunds} named={reading.recovery} />
        </dd>
      </div>
      <div className="dbg-fact" data-s={salt} data-bad={salt && !reading.salt.ok ? "" : undefined}>
        <dt>Salt</dt>
        <dd>
          <span className="dbg-field dbg-salt" data-d={salt ? "" : undefined}>
            <Reels text={salt ? reading.salt.value : ZERO_SALT} spin={!!salt} still={still} />
          </span>
        </dd>
      </div>
      <div className="dbg-fact" data-s={chain} data-bad={chain && !reading.chain.ok ? "" : undefined}>
        <dt>Chain</dt>
        <dd>
          <Field value={reading.chain.value} read={!!chain} named={reading.chain} />
        </dd>
      </div>
    </dl>
  );
}

// ---- The proof ----------------------------------------------------------------------------------------

export type Action = { label: string; onClick: () => void };

/** The verdict both ways: what it says, and what can be done next. */
type Outcome = { text: string; actions: Action[] };

/**
 * The address as issued, and the one the terms give. Both verdicts share one cell, so neither
 * moves the page when it appears.
 */
export function Proof({
  label,
  address,
  computed,
  ran,
  verdict,
  still,
  ok,
  bad,
}: {
  label: string;
  address: string;
  computed: string;
  ran: boolean;
  verdict: "ok" | "bad" | undefined;
  still: boolean;
  ok: Outcome;
  bad: Outcome;
}) {
  return (
    <div className="dbg-proof" data-verdict={verdict}>
      <div className="dbg-proof-lines">
        <div className="dbg-proof-line">
          <span className="dbg-key">{label}</span>
          <code className="dbg-addr">
            <Reels text={address} spin still={still} />
          </code>
        </div>
        <div className="dbg-proof-line">
          <span className="dbg-key">Recomputed</span>
          <code className="dbg-addr dbg-addr-computed" data-ran={ran ? "" : undefined}>
            <Reels text={ran ? computed : ZERO_ADDRESS} spin={ran} still={still} />
          </code>
        </div>
      </div>

      <div className="dbg-verdicts" aria-live="polite">
        {(["ok", "bad"] as const).map((kind) => {
          const outcome = kind === "ok" ? ok : bad;
          const shown = verdict === kind;
          return (
            <div key={kind} className="dbg-verdict" data-bad={kind === "bad" ? "" : undefined} data-show={shown ? "" : undefined} aria-hidden={shown ? undefined : true}>
              <p className="dbg-verdict-head">
                <Check ok={kind === "ok"} />
                {outcome.text}
              </p>
              {outcome.actions.length > 0 && (
                <span className="dbg-actions">
                  {outcome.actions.map((a) => (
                    <button key={a.label} type="button" className="dbg-action" onClick={a.onClick} tabIndex={shown ? undefined : -1}>
                      {a.label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
