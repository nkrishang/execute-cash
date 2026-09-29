"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { StatusChip } from "@/components/status-chip";
import { verify, type Verification } from "@/lib/execute/derive";
import type { Story } from "@/lib/execute/describe";
import { addressUrl, explorerName, formatAmount, formatMinute, short, txUrl } from "@/lib/execute/format";
import type { Chain, ExecutableAddress, StatusView } from "@/lib/execute/types";
import { AddressDebugger } from "./debugger";
import { buildSession } from "./session";

/*
 * The top of an address page: where the money is and the address to copy, then the debugger, which
 * shows what sending to it does, read from its own bytes.
 */

export function AddressView({ exe, story, chains, initialStatus }: { exe: ExecutableAddress; story: Story; chains: Chain[]; initialStatus: StatusView | null }) {
  const { intent } = exe;
  const status = useStatus(exe.address, initialStatus);
  const session = useMemo(() => {
    try {
      return buildSession(exe);
    } catch {
      return null;
    }
  }, [exe]);

  // In the browser, never on the server: the point is not to take the API's word for it.
  const [check, setCheck] = useState<Verification | null>(null);
  useEffect(() => setCheck(verify(exe)), [exe]);

  const explorer = addressUrl(intent.chainId, exe.address);

  return (
    <>
      <header className="ad-head">
        <h1 className="sr-only">
          Send {story.amount} {story.symbol}. It {story.verb} {story.object}.
        </h1>
        <StatusLine exe={exe} story={story} status={status} />
        <div className="ad-address">
          <code className="ad-address-text" aria-label={exe.address}>
            <b>{exe.address.slice(0, 6)}</b>
            {exe.address.slice(6, -4)}
            <b>{exe.address.slice(-4)}</b>
          </code>
          <span className="ad-address-actions">
            <CopyButton value={exe.address} className="ad-address-button" />
            {explorer && (
              <a className="ad-address-button" href={explorer} target="_blank" rel="noopener noreferrer">
                {explorerName(intent.chainId)}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
          </span>
        </div>
      </header>

      {check && !check.ok && (
        <p className="ad-alarm" role="alert">
          <strong>Don’t send to this address.</strong> Its terms don’t check out in your browser: {check.reason}.
        </p>
      )}

      {session ? (
        <AddressDebugger exe={exe} session={session} story={story} chains={chains} />
      ) : (
        <p className="ad-alarm" role="alert">
          <strong>This address can’t be opened here.</strong> Its intent uses a function this page can’t encode, so it can’t be checked in your browser.
        </p>
      )}
    </>
  );
}

// ---- Status -------------------------------------------------------------------------------------------

const TERMINAL = new Set(["settled", "refunded"]);

/** The status, polled until the address has executed; slower once it has expired unpaid. */
function useStatus(address: string, initial: StatusView | null) {
  const [status, setStatus] = useState(initial);
  const state = status?.state;
  useEffect(() => {
    if (state && TERMINAL.has(state)) return;
    const id = window.setInterval(
      async () => {
        try {
          const res = await fetch(`/api/execute/address/${address}/status`, { cache: "no-store" });
          if (res.ok) setStatus((await res.json()) as StatusView);
        } catch {
          // Try again on the next tick.
        }
      },
      state === "expired" ? 15_000 : 3_000,
    );
    return () => window.clearInterval(id);
  }, [address, state]);
  return status;
}

/** Unix seconds, ticking; null until mounted, so the server and the first render agree. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function StatusLine({ exe, story, status }: { exe: ExecutableAddress; story: Story; status: StatusView | null }) {
  const now = useNow();
  const { intent } = exe;
  if (!status) return <p className="ad-status">Status unavailable</p>;

  const money = (units: string) => `${story.decimals === null ? units : formatAmount(units, story.decimals)} ${story.symbol}`;
  const tx = (hash: string) => {
    const url = txUrl(intent.chainId, hash);
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {short(hash, 6)}
      </a>
    ) : (
      <span className="ad-mono">{short(hash, 6)}</span>
    );
  };

  let detail: ReactNode;
  switch (status.state) {
    case "awaiting_funds": {
      const left = now === null ? null : intent.expirationTimestamp - now;
      detail =
        BigInt(status.balance) > 0n
          ? `Holds ${money(status.balance)} of ${story.amount}`
          : left === null
            ? `Expires ${formatMinute(intent.expirationTimestamp)}`
            : left > 0
              ? `Expires in ${clock(left)}`
              : "Expiring";
      break;
    }
    case "funded":
      detail = "Paid in full, executing now";
      break;
    case "failing":
      detail = `${status.message.replace(/\.$/, "")}. Retrying until it expires`;
      break;
    case "settled":
      detail = <>Block {status.blockNumber.toLocaleString("en-US")} · {tx(status.transactionHash)}</>;
      break;
    case "refunding":
      detail = `Returning ${money(status.balance)} to ${short(intent.recovery)}`;
      break;
    case "refunded":
      detail = (
        <>
          {money(status.amount)} to {short(intent.recovery)} · {tx(status.transactionHash)}
        </>
      );
      break;
    case "expired":
      detail = "Nothing was paid in time";
      break;
  }

  return (
    <p className="ad-status">
      <StatusChip state={status.state} />
      <span className="ad-status-detail">{detail}</span>
    </p>
  );
}
