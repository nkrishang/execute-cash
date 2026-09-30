"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChainId, History, Vault } from "@/lib/switch";
import { ApyChart, type Line } from "./chart";
import { percent, points, usd } from "./format";

/*
 * What switching earns: both vaults' APY now and over the last 30 days, and what that comes to in a
 * year on the amount being switched (and on the whole position, when the destination holds more).
 */

/** Each vault's history, fetched once per page: the route caches it for ten minutes anyway. */
const histories = new Map<string, Promise<History>>();

function historyOf(chainId: ChainId, vault: string): Promise<History> {
  const key = `${chainId}:${vault}`;
  let promise = histories.get(key);
  if (!promise) {
    promise = fetch(`/api/switch/history?chainId=${chainId}&vault=${vault}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ history: Record<string, History> }>) : Promise.reject(new Error(`${res.status}`))))
      .then((body) => body.history[vault] ?? [])
      .catch((error: unknown) => {
        histories.delete(key);
        throw error;
      });
    histories.set(key, promise);
  }
  return promise;
}

function useHistory(vault: Vault | null): { points: History; loading: boolean } {
  const key = vault ? `${vault.chainId}:${vault.address}` : "";
  const [state, setState] = useState<{ key: string; points: History }>({ key: "", points: [] });
  useEffect(() => {
    if (!vault) return;
    let gone = false;
    historyOf(vault.chainId, vault.address).then(
      (points) => !gone && setState({ key: `${vault.chainId}:${vault.address}`, points }),
      () => !gone && setState({ key: `${vault.chainId}:${vault.address}`, points: [] }),
    );
    return () => {
      gone = true;
    };
  }, [vault]);
  return state.key === key ? { points: state.points, loading: false } : { points: [], loading: !!vault };
}

const average = (h: History) => (h.length ? h.reduce((sum, p) => sum + p[1], 0) / h.length : null);

/** Dollars to the cent, or "<$0.01". */
const cents = (x: number) =>
  x > 0 && x < 0.01 ? "<$0.01" : `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedCents = (x: number) => `${x >= 0 ? "+" : "−"}${cents(Math.abs(x))}`;

const Arrow = () => (
  <svg className="sw-compare-arrow" viewBox="0 0 24 16" aria-hidden="true">
    <path d="M2 8h19M15 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Compare({ from, to, amountUsd, heldUsd }: { from: Vault | null; to: Vault | null; amountUsd: number | null; heldUsd: number | null }) {
  const a = useHistory(from);
  const b = useHistory(to);
  const lines = useMemo<Line[]>(
    () => [
      ...(from ? [{ tone: "from" as const, name: from.name, points: a.points }] : []),
      ...(to ? [{ tone: "to" as const, name: to.name, points: b.points }] : []),
    ],
    [from, to, a.points, b.points],
  );

  if (!from || !to) {
    return (
      <section className="sw-compare" aria-label="What switching earns">
        <p className="sw-compare-empty">Pick two vaults to compare them.</p>
      </section>
    );
  }

  const delta = to.apy - from.apy;
  const avgA = average(a.points);
  const avgB = average(b.points);
  // A year at today's rates: the amount being switched, or $1,000 before there is one.
  const base = amountUsd ?? 1000;
  const years = [
    { label: amountUsd === null ? "A year on $1,000" : `A year on the ${cents(base)} you switch`, value: base },
    ...(heldUsd !== null && amountUsd !== null && heldUsd > amountUsd * 1.01 ? [{ label: `A year on the whole ${cents(heldUsd)} position`, value: heldUsd }] : []),
  ];

  return (
    <section className="sw-compare" aria-labelledby="sw-compare-title">
      <h2 id="sw-compare-title" className="sw-compare-title">
        What switching earns
      </h2>
      <p className="sw-compare-hero">
        <span className="sw-compare-from">{percent(from.apy)}</span>
        <Arrow />
        <span className="sw-compare-to">{percent(to.apy)}</span>
        <span className="sr-only">APY</span>
      </p>
      <p className="sw-compare-sub">
        {Math.abs(delta) < 0.00005
          ? "The same APY, net of fees, at today’s rates."
          : `${points(delta)} percentage points of APY, net of fees, at today’s rates.`}
      </p>

      <ApyChart lines={lines} loading={a.loading || b.loading} />

      <table className="sw-table">
        <thead>
          <tr>
            <td />
            <th scope="col">
              <i data-tone="from" aria-hidden="true" />
              From
            </th>
            <th scope="col">
              <i data-tone="to" aria-hidden="true" />
              To
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">APY now</th>
            <td>{percent(from.apy)}</td>
            <td>{percent(to.apy)}</td>
            <td>{points(delta)}</td>
          </tr>
          <tr>
            <th scope="row">30-day average</th>
            <td>{avgA === null ? "—" : percent(avgA)}</td>
            <td>{avgB === null ? "—" : percent(avgB)}</td>
            <td>{avgA === null || avgB === null ? "" : points(avgB - avgA)}</td>
          </tr>
          {years.map((y) => (
            <tr key={y.label}>
              <th scope="row">{y.label}</th>
              <td>{cents(y.value * from.apy)}</td>
              <td>{cents(y.value * to.apy)}</td>
              <td>{signedCents(y.value * delta)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Deposits</th>
            <td>{usd(from.depositsUsd)}</td>
            <td>{usd(to.depositsUsd)}</td>
            <td />
          </tr>
          <tr>
            <th scope="row">Can be withdrawn now</th>
            <td>{usd(from.liquidityUsd)}</td>
            <td>{usd(to.liquidityUsd)}</td>
            <td />
          </tr>
          <tr>
            <th scope="row">Curator</th>
            <td>{from.curator ?? "—"}</td>
            <td>{to.curator ?? "—"}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="sw-compare-note">
        Net APY, after the vaults’ fees, from Morpho. It changes every block; past APY doesn’t promise future APY. Execute pays the gas.
      </p>
    </section>
  );
}
