"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatUnits, getAddress, isAddress, isAddressEqual, parseUnits, type Address } from "viem";
import { CopyButton } from "@/components/copy-button";
import { UsdcMark } from "@/components/debugger-kit";
import { Problem, useProblemsShown } from "@/components/field-problem";
import { QrCode } from "@/components/qr-code";
import { StatusChip } from "@/components/status-chip";
import { CONTRACTS, MARKET_URL, MAX_AMOUNT, MAX_USDC, MIN_AMOUNT, MIN_USDC, readBitsoIntent } from "@/lib/bitso";
import { FACTORY, IMPLEMENTATION } from "@/lib/docs";
import { verify } from "@/lib/execute/derive";
import { formatAmount, short, txUrl } from "@/lib/execute/format";
import type { ApiErrorBody, ExecutableAddress, StatusView } from "@/lib/execute/types";
import { Terms, type Proof } from "./terms";

/*
 * /bitso's tool: a wallet and an amount make an executable address (app/api/bitso), checked here
 * against what the page says it does, then paid from any wallet and watched until the collateral
 * is posted. The terms window beside it shows the calls, filling in as they're known.
 */

type Field<T> = { ok: true; value: T } | { ok: false; message: string; fix?: string };

const NOT_A_WALLET = [...CONTRACTS, FACTORY, IMPLEMENTATION] as Address[];

function checkWallet(input: string): Field<Address> {
  const value = input.trim();
  if (!value) return { ok: false, message: "Enter your wallet’s address" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, message: "An address is 0x and 40 hex characters" };
  if (!isAddress(value)) return { ok: false, message: "That address has a bad checksum", fix: getAddress(value.toLowerCase()) };
  if (/^0x0{40}$/.test(value)) return { ok: false, message: "Use an address you control" };
  if (NOT_A_WALLET.some((c) => isAddressEqual(c, value))) return { ok: false, message: "That’s a contract this address calls. Use your wallet" };
  return { ok: true, value: getAddress(value) };
}

function checkAmount(input: string): Field<bigint> {
  const value = input.trim().replace(/,/g, "");
  if (!value) return { ok: false, message: "Enter how much USDC to deposit" };
  if (!/^\d*\.?\d*$/.test(value) || value === ".") return { ok: false, message: "Enter an amount of USDC, like 5 or 2.50" };
  if (/\.\d{7,}$/.test(value)) return { ok: false, message: "USDC has 6 decimals" };
  const units = parseUnits(value, 6);
  if (units < MIN_AMOUNT) return { ok: false, message: `Deposit at least ${MIN_USDC} USDC` };
  if (units > MAX_AMOUNT) return { ok: false, message: `Deposit at most ${MAX_USDC} USDC for now` };
  return { ok: true, value: units };
}

type Made = { exe: ExecutableAddress; wallet: Address; units: bigint };

/**
 * The address in progress, kept in this browser so a reload doesn't lose it: phones often reload a
 * tab when its wallet app comes back to it. It's checked again on the way back in, like a new one.
 */
const SAVED = "execute.bitso";

function restore(): Made | null {
  try {
    const raw = window.localStorage.getItem(SAVED);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { exe: ExecutableAddress; wallet: Address; units: string };
    // An hour past its expiry it has long settled or gone back.
    if (saved.exe.intent.expirationTimestamp + 3600 < Date.now() / 1000) return null;
    return { exe: saved.exe, wallet: saved.wallet, units: BigInt(saved.units) };
  } catch {
    return null;
  }
}

function keep(made: Made | null) {
  try {
    if (made) window.localStorage.setItem(SAVED, JSON.stringify({ exe: made.exe, wallet: made.wallet, units: made.units.toString() }));
    else window.localStorage.removeItem(SAVED);
  } catch {
    // Private windows and blocked storage: the page works, a reload just starts over.
  }
}

/** Whether the address the API made is the one this page describes, for this wallet and amount. */
function prove({ exe, wallet, units }: Made): Proof {
  const derived = verify(exe);
  if (!derived.ok) return { address: exe.address, ok: false, reason: derived.reason };
  const terms = readBitsoIntent(exe.intent);
  if (!terms) return { address: exe.address, ok: false, reason: "its calls aren’t the ones shown here" };
  if (!isAddressEqual(terms.wallet, wallet)) return { address: exe.address, ok: false, reason: `it credits ${short(terms.wallet)}, not your wallet` };
  if (terms.amount !== units) return { address: exe.address, ok: false, reason: `it takes ${formatAmount(terms.amount.toString(), 6)} USDC, not what you entered` };
  return { address: exe.address, ok: true };
}

export function BitsoTool() {
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [walletShown, showWallet] = useProblemsShown(wallet);
  const [amountShown, showAmount] = useProblemsShown(amount);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  // In the browser, never on the server: the point is not to take anyone's word for it.
  const [proof, setProof] = useState<Proof | null>(null);
  useEffect(() => setProof(made ? prove(made) : null), [made]);

  useEffect(() => {
    const saved = restore();
    if (!saved) return;
    setMade(saved);
    setWallet(saved.wallet);
    setAmount(formatUnits(saved.units, 6));
  }, []);

  const track = (next: Made | null) => {
    setMade(next);
    keep(next);
  };

  const w = checkWallet(wallet);
  const a = checkAmount(amount);
  const walletProblem = walletShown && !w.ok ? w : null;
  const amountProblem = amountShown && !a.ok ? a : null;

  const create = async () => {
    if (!w.ok || !a.ok) {
      showWallet();
      showAmount();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/bitso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: w.value, amount: a.value.toString() }),
      });
      const body = (await res.json()) as ExecutableAddress | ApiErrorBody;
      if (!res.ok || "error" in body) {
        const err = "error" in body ? body.error : null;
        setError(err ? (err.issues[0]?.message ?? err.message) : `The page’s API answered ${res.status}`);
        return;
      }
      track({ exe: body, wallet: w.value, units: a.value });
    } catch {
      setError("Couldn’t reach Execute. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  const terms = made ? readBitsoIntent(made.exe.intent) : null;

  return (
    <div className="bitso-tool">
      <div className="bitso-card">
        {made ? (
          <Pay made={made} proof={proof} onReset={() => track(null)} />
        ) : (
          <form
            className="bitso-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="bitso-label" htmlFor="bitso-wallet">
              Your wallet on Base
            </label>
            <input
              id="bitso-wallet"
              className="input"
              placeholder="0x…"
              aria-invalid={walletProblem ? true : undefined}
              aria-describedby={walletProblem ? "bitso-wallet-problem" : "bitso-wallet-note"}
              value={wallet}
              onChange={(e) => {
                setWallet(e.target.value);
                setError(null);
              }}
              onBlur={showWallet}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
            />
            {walletProblem ? (
              <Problem id="bitso-wallet-problem" message={walletProblem.message} fix={walletProblem.fix} onFix={setWallet} />
            ) : (
              <p id="bitso-wallet-note" className="bitso-note">
                This address will own the Morpho position on{" "}
                <a href={MARKET_URL} target="_blank" rel="noopener noreferrer">
                  MXNB-bitusdcp
                </a>{" "}
                that lets you borrow MXNB. Use a wallet you control.
              </p>
            )}

            <label className="bitso-label" htmlFor="bitso-amount">
              Deposit
            </label>
            <div className="bitso-amount-field">
              <input
                id="bitso-amount"
                className="input"
                placeholder={`Up to ${MAX_USDC}`}
                inputMode="decimal"
                aria-invalid={amountProblem ? true : undefined}
                aria-describedby={amountProblem ? "bitso-amount-problem" : undefined}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                onBlur={showAmount}
                autoComplete="off"
              />
              <span className="bitso-amount-unit" aria-hidden="true">
                <UsdcMark />
                USDC
              </span>
            </div>
            {amountProblem && <Problem id="bitso-amount-problem" message={amountProblem.message} />}

            <button type="submit" className="btn btn-primary bitso-submit" disabled={creating || !wallet.trim() || !amount.trim()}>
              {creating ? "Creating…" : "Create address"}
            </button>
            {error && <Problem id="bitso-error" message={error} />}
            <p className="bitso-note bitso-note-center">No wallet connection. No approvals. Pay it from any wallet.</p>
          </form>
        )}
      </div>

      <Terms wallet={made?.wallet ?? (w.ok ? w.value : null)} units={made?.units ?? (a.ok ? a.value : null)} terms={terms} proof={proof} />
    </div>
  );
}

// ---- The address, and where its money is ----------------------------------------------------------

const DONE = new Set(["settled", "refunded"]);

/** The status, polled until the address has executed; slower once it has expired unpaid. */
function useStatus(address: string) {
  const [status, setStatus] = useState<StatusView | null>(null);
  const state = status?.state;
  useEffect(() => {
    if (state && DONE.has(state)) return;
    let gone = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/execute/address/${address}/status`, { cache: "no-store" });
        if (res.ok && !gone) setStatus((await res.json()) as StatusView);
      } catch {
        // Next tick.
      }
    };
    void poll();
    const id = window.setInterval(poll, state === "expired" ? 15_000 : 2_500);
    return () => {
      gone = true;
      window.clearInterval(id);
    };
  }, [address, state]);
  return status;
}

function useSecondsLeft(until: number) {
  const [left, setLeft] = useState(() => until - Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(until - Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return Math.max(0, left);
}

type Collateral = { shares: bigint; assets: bigint };

/** The wallet's collateral in the market, read once the address has settled (a few tries: RPCs lag). */
function useCollateral(wallet: Address, settled: boolean) {
  const [collateral, setCollateral] = useState<Collateral | null>(null);
  useEffect(() => {
    if (!settled) return;
    let gone = false;
    let tries = 0;
    const read = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/bitso/position?wallet=${wallet}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { shares: string; assets: string };
          const next = { shares: BigInt(body.shares), assets: BigInt(body.assets) };
          if (!gone) setCollateral(next);
          if (next.shares > 0n) return;
        }
      } catch {
        // Tried again below.
      }
      if (!gone && tries < 4) window.setTimeout(read, 3_000);
    };
    void read();
    return () => {
      gone = true;
    };
  }, [wallet, settled]);
  return collateral;
}

type Stage = "done" | "on" | "bad" | undefined;

/** Base units to two decimals: "1,000.00". */
const decimal = (units: bigint, decimals: number) =>
  Number(formatUnits(units, decimals)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Pay({ made, proof, onReset }: { made: Made; proof: Proof | null; onReset: () => void }) {
  const { exe, wallet } = made;
  const { intent } = exe;
  const status = useStatus(exe.address);
  const left = useSecondsLeft(intent.expirationTimestamp);
  const state = status?.state ?? "awaiting_funds";
  const collateral = useCollateral(wallet, state === "settled");
  // An EIP-681 payment request fills in the chain, the token and the amount, in base units. A few
  // wallets can only read a bare address; for them the payer can fall back, and choose all three.
  const [kind, setKind] = useState<"request" | "address">("request");
  const amount = formatAmount(intent.amount, 6);
  const request = `ethereum:${intent.token}@${intent.chainId}/transfer?address=${exe.address}&uint256=${intent.amount}`;
  const tx = status && "transactionHash" in status ? status.transactionHash : null;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const bad = proof !== null && !proof.ok;

  const paid: Stage = state === "awaiting_funds" ? "on" : state === "expired" ? undefined : "done";
  // A refund never deposited anything: that step stays undone.
  const executing: Stage = state === "funded" ? "on" : state === "failing" ? "bad" : state === "settled" ? "done" : undefined;
  const finished: Stage = state === "settled" || state === "refunded" ? "done" : state === "refunding" ? "on" : state === "expired" ? "bad" : undefined;
  const held = status?.state === "awaiting_funds" && BigInt(status.balance) > 0n ? BigInt(status.balance) : 0n;

  const link = (href: string | null, text: string) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    ) : null;

  const steps: { stage: Stage; label: string; detail?: ReactNode }[] = [
    {
      stage: bad ? "bad" : "done",
      label: bad ? "Created, but it doesn’t check out" : "Created",
      detail: bad ? "Don’t send to it." : proof?.ok ? "Its terms check out in your browser" : "Checking its terms…",
    },
    {
      stage: paid,
      label: paid === "done" ? "Paid" : `Waiting for ${amount} USDC`,
      detail:
        state === "awaiting_funds"
          ? held > 0n
            ? `Holds ${formatAmount(held.toString(), 6)} of ${amount} USDC`
            : left > 0
              ? `Expires in ${clock}. Later, it goes back to your wallet`
              : "Expiring"
          : undefined,
    },
    {
      stage: executing,
      label: state === "failing" ? "Retrying" : "Depositing and posting collateral",
      detail:
        status?.state === "failing"
          ? `${status.message.replace(/\.$/, "")}. If it can’t go through before it expires, your USDC goes back to your wallet`
          : state === "funded"
            ? "Bitso USDC Prime, then the MXNB market, in one transaction"
            : undefined,
    },
    {
      stage: finished,
      label:
        state === "refunding" ? "Returning your USDC" : state === "refunded" ? "Returned to your wallet" : state === "expired" ? "Expired unpaid" : "Collateral posted",
      detail:
        state === "settled" ? (
          <>
            {collateral && collateral.shares > 0n
              ? `Your wallet has ${decimal(collateral.shares, 18)} bitusdcp of collateral, worth ${decimal(collateral.assets, 6)} USDC. `
              : null}
            {tx && link(txUrl(intent.chainId, tx), "View the transaction")}
          </>
        ) : state === "refunded" && tx ? (
          link(txUrl(intent.chainId, tx), "View the transaction")
        ) : undefined,
    },
  ];

  return (
    <div className="bitso-pay">
      <p className="bitso-pay-status">
        <StatusChip state={state} />
        <code>{short(exe.address, 6)}</code>
      </p>

      {proof && !proof.ok && (
        <p className="ad-alarm" role="alert">
          <strong>Don’t send to this address.</strong> It doesn’t check out in your browser: {proof.reason}.
        </p>
      )}

      {state === "awaiting_funds" && !bad && (
        <div className="bitso-scan">
          <div className="bitso-qr">
            <QrCode
              value={kind === "request" ? request : exe.address}
              label={kind === "request" ? `Payment request: ${amount} USDC on Base to ${exe.address}` : `Address ${exe.address}`}
              mark={<UsdcMark />}
            />
          </div>
          <div className="bitso-scan-text">
            {kind === "request" ? (
              <p className="bitso-note">
                Scan with your phone’s wallet. It fills in <strong>{amount} USDC</strong> on <strong>Base</strong> for you.
              </p>
            ) : (
              <p className="bitso-note" data-tone="warn">
                Address only. In your wallet, pick <strong>USDC</strong> on <strong>Base</strong> and enter <strong>{amount}</strong> yourself.
              </p>
            )}
            <button type="button" className="bitso-switch" onClick={() => setKind(kind === "request" ? "address" : "request")}>
              {kind === "request" ? "Wallet can’t read it? Show a plain address code" : "Show the payment request code"}
            </button>
          </div>
        </div>
      )}

      {state === "awaiting_funds" && (
        <>
          <p className="bitso-label">Send exactly</p>
          <div className="bitso-value">
            <span className="bitso-value-amount">{amount} USDC</span>
            <span className="bitso-value-chain">on Base</span>
            <CopyButton value={formatUnits(BigInt(intent.amount), 6)} label="Copy amount" className="btn btn-quiet btn-sm" />
          </div>
          <p className="bitso-label">To</p>
          <div className="bitso-address">
            <code>{exe.address}</code>
            <CopyButton value={exe.address} className="btn btn-quiet btn-sm" />
          </div>
        </>
      )}

      <ol className="bitso-steps" aria-live="polite">
        {steps.map((s) => (
          <li key={s.label} className="bitso-step" data-stage={s.stage}>
            <span className="bitso-step-dot" aria-hidden="true" />
            <span className="bitso-step-text">
              <span className="bitso-step-label">{s.label}</span>
              {s.detail && <span className="bitso-step-detail">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {state === "settled" && (
        <p className="bitso-note bitso-risk">
          Borrowing MXNB against it carries MXN/USD and liquidation risk: Morpho liquidates the loan if it reaches 91.5% of the collateral’s value.
        </p>
      )}

      <div className="bitso-actions">
        {state === "settled" && (
          <a className="btn btn-primary btn-sm" href={MARKET_URL} target="_blank" rel="noopener noreferrer">
            Borrow MXNB on Morpho
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
        <a className="btn btn-quiet btn-sm" href={`/address/${exe.address}`} target="_blank" rel="noopener noreferrer">
          Verify execution
        </a>
        <button type="button" className="btn btn-quiet btn-sm bitso-redo" onClick={onReset} aria-label="Start over" title="Start over">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M12.8 8a4.8 4.8 0 1 1-1.5-3.5M13 2.8v2.6h-2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
