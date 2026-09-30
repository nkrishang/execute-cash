"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { isAddressEqual, type Address } from "viem";
import { CopyButton } from "@/components/copy-button";
import { QrCode } from "@/components/qr-code";
import { StatusChip } from "@/components/status-chip";
import { verify } from "@/lib/execute/derive";
import { short, txUrl } from "@/lib/execute/format";
import type { ExecutableAddress, StatusView } from "@/lib/execute/types";
import { CHAINS, leastAssets, readSwitchIntent, type ChainId, type Position, type Vault } from "@/lib/switch";
import { exactShares, shares as shareText, token } from "./format";

/*
 * Paying a switch: the address, as a payment request for the source vault's shares and as a plain
 * address, then where its money is until the new shares are at the destination. The address is
 * checked here, in the browser, against the switch the page asked for before anyone is asked to pay it.
 */

/** A switch the API made: what was asked for, and the address it answered with. */
export type Made = {
  exe: ExecutableAddress;
  chainId: ChainId;
  wallet: Address;
  from: Address;
  to: Address;
  asset: Address;
  shares: bigint;
  /** What the shares redeemed for when quoted, in the asset's base units. */
  assets: bigint;
  /** Whether the shares are all the destination holds of them. */
  all: boolean;
};

export type Proof = { ok: true } | { ok: false; reason: string };

/** Whether the address is the switch the page asked for: derived from its terms, and those terms read back. */
export function prove(made: Made, from: Vault | null): Proof {
  const derived = verify(made.exe);
  if (!derived.ok) return { ok: false, reason: derived.reason };
  const terms = readSwitchIntent(made.exe.intent);
  if (!terms) return { ok: false, reason: "its calls aren’t a switch" };
  if (terms.chainId !== made.chainId) return { ok: false, reason: `it runs on ${CHAINS[terms.chainId].name}` };
  if (!isAddressEqual(terms.from, made.from)) return { ok: false, reason: `it takes shares of ${short(terms.from)}, not the vault you picked` };
  if (!isAddressEqual(terms.to, made.to)) return { ok: false, reason: `it deposits into ${short(terms.to)}, not the vault you picked` };
  if (!isAddressEqual(terms.wallet, made.wallet)) return { ok: false, reason: `the new position goes to ${short(terms.wallet)}, not the destination you entered` };
  if (terms.shares !== made.shares) return { ok: false, reason: `it takes ${shareText(terms.shares)} shares, not ${shareText(made.shares)}` };
  if (terms.route === "vault-bundles" && !isAddressEqual(terms.asset, made.asset)) return { ok: false, reason: "it approves a different token" };
  // The shares may only earn between the quote and the switch; a floor well under the quote isn't one.
  if (leastAssets(terms) * 100n < made.assets * 99n) {
    const floor = from ? `${token(leastAssets(terms), from.asset.decimals)} ${from.asset.symbol}` : "far less";
    return { ok: false, reason: `it would accept ${floor} for shares quoted at more` };
  }
  return { ok: true };
}

/**
 * The switch in progress, kept in this browser so a reload doesn't lose it: phones often reload a
 * tab when its wallet app comes back to it. It's checked again on the way back in, like a new one.
 */
const SAVED = "execute.switch";

export function restore(): Made | null {
  try {
    const raw = window.localStorage.getItem(SAVED);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Omit<Made, "shares" | "assets"> & { shares: string; assets: string };
    // An hour past its expiry it has long settled or gone back.
    if (saved.exe.intent.expirationTimestamp + 3600 < Date.now() / 1000) return null;
    return { ...saved, shares: BigInt(saved.shares), assets: BigInt(saved.assets) };
  } catch {
    return null;
  }
}

export function keep(made: Made | null) {
  try {
    if (made) window.localStorage.setItem(SAVED, JSON.stringify({ ...made, shares: made.shares.toString(), assets: made.assets.toString() }));
    else window.localStorage.removeItem(SAVED);
  } catch {
    // Private windows and blocked storage: the page works, a reload just starts over.
  }
}

// ---- Where the money is ------------------------------------------------------------------------------

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

/** The destination's position in the vault switched into, read once the address has settled (a few tries: RPCs lag). */
function useLanded(made: Made, settled: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  useEffect(() => {
    if (!settled) return;
    let gone = false;
    let tries = 0;
    const read = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/switch/positions?chainId=${made.chainId}&wallet=${made.wallet}`, { cache: "no-store" });
        if (res.ok) {
          const { positions } = (await res.json()) as { positions: Position[] };
          const landed = positions.find((p) => isAddressEqual(p.vault, made.to));
          if (landed && !gone) {
            setPosition(landed);
            return;
          }
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
  }, [made.chainId, made.wallet, made.to, settled]);
  return position;
}

type Stage = "done" | "on" | "bad" | undefined;

/** The source vault's image in the middle of the QR code, drawn in its SVG. */
function QrMark({ image }: { image: string }) {
  const clip = `sw-qr-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <clipPath id={clip}>
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <image href={image} width="32" height="32" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
    </svg>
  );
}

const MORPHO_CHAINS: Record<ChainId, string> = { 8453: "base", 143: "monad", 5042: "arc" };
export const morphoVaultUrl = (chainId: ChainId, vault: string) => `https://app.morpho.org/${MORPHO_CHAINS[chainId]}/vault/${vault}`;

const Out = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Pay({ made, from, to, proof, onReset }: { made: Made; from: Vault | null; to: Vault | null; proof: Proof | null; onReset: () => void }) {
  const { exe } = made;
  const { intent } = exe;
  const chain = CHAINS[made.chainId].name;
  const status = useStatus(exe.address);
  const left = useSecondsLeft(intent.expirationTimestamp);
  const state = status?.state ?? "awaiting_funds";
  const landed = useLanded(made, state === "settled");
  // An EIP-681 payment request fills in the chain, the token and the amount, in base units. A few
  // wallets can only read a bare address; for them the payer can fall back, and choose all three.
  const [kind, setKind] = useState<"request" | "address">("request");
  const symbol = from?.symbol ?? "shares";
  const fromName = from?.name ?? short(made.from);
  const toName = to?.name ?? short(made.to);
  const amount = shareText(made.shares);
  const exact = exactShares(made.shares);
  const request = `ethereum:${intent.token}@${intent.chainId}/transfer?address=${exe.address}&uint256=${intent.amount}`;
  const tx = status && "transactionHash" in status ? status.transactionHash : null;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const bad = proof !== null && !proof.ok;

  const paid: Stage = state === "awaiting_funds" ? "on" : state === "expired" ? undefined : "done";
  // A refund never switched anything: that step stays undone.
  const switching: Stage = state === "funded" ? "on" : state === "failing" ? "bad" : state === "settled" ? "done" : undefined;
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
      detail: bad ? "Don’t send to it." : proof?.ok ? `Its terms check out in your browser. The new position goes to ${short(made.wallet)}` : "Checking its terms…",
    },
    {
      stage: paid,
      label: paid === "done" ? "Paid" : `Waiting for ${amount} ${symbol}`,
      detail:
        state === "awaiting_funds"
          ? held > 0n
            ? `Holds ${shareText(held)} of ${amount} ${symbol}`
            : left > 0
              ? `Expires in ${clock}. Shares sent after that go to the destination address`
              : "Expiring"
          : undefined,
    },
    {
      stage: switching,
      label: state === "failing" ? "Retrying" : `Withdrawing from ${fromName}, depositing into ${toName}`,
      detail:
        status?.state === "failing"
          ? `${status.message.replace(/\.$/, "")}. If it can’t go through before it expires, the shares go to the destination address`
          : state === "funded"
            ? "In one transaction"
            : undefined,
    },
    {
      stage: finished,
      label:
        state === "refunding"
          ? "Sending the shares to the destination address"
          : state === "refunded"
            ? "Sent to the destination address"
            : state === "expired"
              ? "Expired unpaid"
              : "Switched",
      detail:
        state === "settled" ? (
          <>
            {landed && to
              ? `${short(made.wallet)} holds ${shareText(landed.shares)} ${to.symbol}, worth ${token(landed.assets, to.asset.decimals)} ${to.asset.symbol}. `
              : null}
            {tx && link(txUrl(intent.chainId, tx), "View the transaction")}
          </>
        ) : state === "refunded" && tx ? (
          link(txUrl(intent.chainId, tx), "View the transaction")
        ) : undefined,
    },
  ];

  return (
    <div className="bitso-pay sw-pay">
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
              label={kind === "request" ? `Payment request: ${amount} ${symbol} on ${chain} to ${exe.address}` : `Address ${exe.address}`}
              mark={from?.image ? <QrMark image={from.image} /> : undefined}
            />
          </div>
          <div className="bitso-scan-text">
            {kind === "request" ? (
              <p className="bitso-note">
                Scan with your phone’s wallet. It fills in{" "}
                <strong>
                  {amount} {symbol}
                </strong>{" "}
                on <strong>{chain}</strong> for you.
              </p>
            ) : (
              <p className="bitso-note" data-tone="warn">
                Address only. In your wallet, pick <strong>{symbol}</strong> on <strong>{chain}</strong> and enter <strong>{exact}</strong> yourself.
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
          <div className="bitso-value sw-value">
            <span className="bitso-value-amount">
              {exact} {symbol}
            </span>
            <span className="bitso-value-chain">
              {fromName} shares on {chain}, from any wallet that holds them
              {made.all ? ` (${short(made.wallet)}’s whole balance)` : ""}
            </span>
            <CopyButton value={exact} label="Copy amount" className="btn btn-quiet btn-sm" />
          </div>
          <p className="bitso-label">To</p>
          <div className="bitso-address">
            <code>{exe.address}</code>
            <CopyButton value={exe.address} className="btn btn-quiet btn-sm" />
          </div>
        </>
      )}

      <ol className="bitso-steps" aria-live="polite">
        {steps.map((s, i) => (
          <li key={i} className="bitso-step" data-stage={s.stage}>
            <span className="bitso-step-dot" aria-hidden="true" />
            <span className="bitso-step-text">
              <span className="bitso-step-label">{s.label}</span>
              {s.detail && <span className="bitso-step-detail">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      <div className="bitso-actions">
        {state === "settled" && (
          <a className="btn btn-primary btn-sm" href={morphoVaultUrl(made.chainId, made.to)} target="_blank" rel="noopener noreferrer">
            See it on Morpho
            <Out />
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
