"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getAddress, isAddress } from "viem";
import { CopyButton } from "@/components/copy-button";
import { UsdcMark } from "@/components/debugger-kit";
import { Problem, useProblemsShown } from "@/components/field-problem";
import { QrCode } from "@/components/qr-code";
import type { Check } from "@/lib/execute/validate";
import type { ApiErrorBody, ExecutableAddress, StatusView } from "@/lib/execute/types";

/*
 * The quickstart's live demo, end to end: a real executable address on Base whose one call sends
 * 0.000001 USDC back to the address that asked for it. Pay it from any wallet and watch it go.
 */

const EXPLORER = "https://basescan.org";
const FINAL = new Set(["settled", "refunded", "expired"]);

function checkRecipient(input: string): Check {
  const value = input.trim();
  if (!value) return { ok: false, message: "Enter your wallet’s address" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, message: "An address is 0x and 40 hex characters" };
  if (!isAddress(value)) {
    const fix = getAddress(value.toLowerCase());
    return { ok: false, message: "That address has a bad checksum", fix };
  }
  if (/^0x0{40}$/.test(value)) return { ok: false, message: "Use an address you control" };
  return { ok: true, value: getAddress(value) };
}

export function Demo() {
  const [draft, setDraft] = useState("");
  const [shown, show] = useProblemsShown(draft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exe, setExe] = useState<ExecutableAddress | null>(null);

  const check = checkRecipient(draft);
  const problem = shown && !check.ok ? check : null;

  const create = async () => {
    if (!check.ok) return show();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: check.value }) });
      const body = (await res.json()) as ExecutableAddress | ApiErrorBody;
      if (!res.ok || "error" in body) {
        const err = "error" in body ? body.error : null;
        setError(err ? (err.issues[0]?.message ?? err.message) : `The demo answered ${res.status}`);
        return;
      }
      setExe(body);
    } catch {
      setError("Couldn’t reach the demo. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  if (exe) return <Created exe={exe} onReset={() => setExe(null)} />;

  return (
    <div className="demo">
      <p className="demo-eyebrow">Live demo · Base</p>
      <p className="demo-title">Pay yourself 0.000001 USDC through an executable address.</p>
      <p className="demo-sub">It’s a real address on Base whose one call sends the USDC back to the address you give here.</p>
      <form
        className="field"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          className="input"
          placeholder="Your address, 0x…"
          aria-label="Your address"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "demo-problem" : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={show}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={creating || !draft.trim()}>
          {creating ? "Creating…" : "Create address"}
        </button>
      </form>
      {problem && <Problem id="demo-problem" message={problem.message} fix={problem.fix} onFix={setDraft} />}
      {error && <Problem id="demo-error" message={error} />}
    </div>
  );
}

// ---- The address, and where it's at -----------------------------------------------------------------

function useStatus(address: string) {
  const [status, setStatus] = useState<StatusView | null>(null);
  const done = status !== null && FINAL.has(status.state);
  useEffect(() => {
    if (done) return;
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
    const id = window.setInterval(poll, 2500);
    return () => {
      gone = true;
      window.clearInterval(id);
    };
  }, [address, done]);
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

type Stage = "done" | "on" | "bad" | undefined;

function Created({ exe, onReset }: { exe: ExecutableAddress; onReset: () => void }) {
  const status = useStatus(exe.address);
  const left = useSecondsLeft(exe.intent.expirationTimestamp);
  // An EIP-681 payment request fills in the chain, the token and the amount, in base units. A few
  // wallets can only read a bare address; for them the payer can fall back, and choose all three.
  const [kind, setKind] = useState<"request" | "address">("request");
  const { intent } = exe;
  const request = `ethereum:${intent.token}@${intent.chainId}/transfer?address=${exe.address}&uint256=${intent.amount}`;
  const state = status?.state ?? "awaiting_funds";
  const tx = status && "transactionHash" in status ? status.transactionHash : null;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  const paid: Stage = state === "awaiting_funds" ? "on" : state === "expired" ? undefined : "done";
  const executing: Stage =
    state === "funded" ? "on" : state === "failing" ? "bad" : ["settled", "refunding", "refunded"].includes(state) ? "done" : undefined;
  const finished: Stage = state === "settled" || state === "refunded" ? "done" : state === "refunding" ? "on" : state === "expired" ? "bad" : undefined;

  const steps: { stage: Stage; label: string; detail?: ReactNode }[] = [
    { stage: "done", label: "Created", detail: "Registered with Execute, and watched on Base" },
    {
      stage: paid,
      label: paid === "done" ? "Paid" : "Waiting for 0.000001 USDC",
      detail: state === "awaiting_funds" ? (left > 0 ? `Expires in ${clock}` : "Expiring") : undefined,
    },
    {
      stage: executing,
      label: state === "failing" ? "Retrying" : "Executing",
      detail: status?.state === "failing" ? status.message : state === "funded" ? "Deploying the address and running its call" : undefined,
    },
    {
      stage: finished,
      label: state === "refunding" ? "Refunding" : state === "refunded" ? "Refunded to you" : state === "expired" ? "Expired unpaid" : "Sent back to you",
      detail: tx ? (
        <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noopener noreferrer">
          View the transaction
        </a>
      ) : undefined,
    },
  ];

  return (
    <div className="demo demo-created">
      <div className="demo-scan">
        <div className="demo-qr">
          <QrCode
            value={kind === "request" ? request : exe.address}
            label={kind === "request" ? `Payment request: 0.000001 USDC on Base to ${exe.address}` : `Address ${exe.address}`}
            mark={<UsdcMark />}
          />
        </div>
        {kind === "request" ? (
          <p className="demo-scan-note">
            Scan with your phone’s wallet. It fills in <strong>0.000001 USDC</strong> on <strong>Base</strong> for you.
          </p>
        ) : (
          <p className="demo-scan-note" data-tone="warn">
            Address only. In your wallet, pick <strong>USDC</strong> on <strong>Base</strong> and enter <strong>0.000001</strong> yourself.
          </p>
        )}
        <button type="button" className="demo-scan-switch" onClick={() => setKind(kind === "request" ? "address" : "request")}>
          {kind === "request" ? "Wallet can’t read it? Show a plain address code" : "Show the payment request code"}
        </button>
      </div>
      <div className="demo-body">
        <p className="demo-eyebrow">Send exactly</p>
        <div className="demo-amount">
          <span className="demo-amount-value">0.000001 USDC</span>
          <span className="demo-amount-chain">on Base</span>
          <CopyButton value="0.000001" label="Copy amount" className="btn btn-quiet btn-sm" />
        </div>
        <p className="demo-eyebrow">To</p>
        <div className="demo-address">
          <code>{exe.address}</code>
          <CopyButton value={exe.address} className="btn btn-quiet btn-sm" />
        </div>
        <ol className="demo-steps">
          {steps.map((s) => (
            <li key={s.label} className="demo-step" data-stage={s.stage}>
              <span className="demo-step-dot" aria-hidden="true" />
              <span className="demo-step-text">
                <span className="demo-step-label">{s.label}</span>
                {s.detail && <span className="demo-step-detail">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
        <div className="demo-actions">
          <a className="btn btn-primary btn-sm" href={`/address/${exe.address}`} target="_blank" rel="noopener noreferrer">
            Open its page
          </a>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onReset}>
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
