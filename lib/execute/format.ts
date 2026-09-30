import { formatUnits } from "viem";
import type { AddressState, Chain } from "./types";

export const CHAIN_NAMES: Record<number, string> = { 8453: "Base", 42161: "Arbitrum", 143: "Monad", 5042: "Arc", 31337: "Anvil" };

const EXPLORERS: Record<number, { name: string; url: string }> = {
  8453: { name: "Basescan", url: "https://basescan.org" },
  42161: { name: "Arbiscan", url: "https://arbiscan.io" },
  143: { name: "Monadscan", url: "https://monadscan.com" },
  5042: { name: "Arc's explorer", url: "https://explorer.arc.io" },
};

export function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

export const explorerName = (chainId: number): string | null => EXPLORERS[chainId]?.name ?? null;

export function txUrl(chainId: number, hash: string): string | null {
  const explorer = EXPLORERS[chainId];
  return explorer ? `${explorer.url}/tx/${hash}` : null;
}

export function addressUrl(chainId: number, address: string): string | null {
  const explorer = EXPLORERS[chainId];
  return explorer ? `${explorer.url}/address/${address}` : null;
}

export function tokenOf(chains: Chain[] | undefined, chainId: number, token: string) {
  const chain = chains?.find((c) => c.chainId === chainId);
  return chain?.tokens.find((t) => t.address.toLowerCase() === token.toLowerCase()) ?? null;
}

/** Base units as "1,000.00", keeping every significant decimal. */
export function formatAmount(amount: string, decimals: number): string {
  const [whole, frac = ""] = formatUnits(BigInt(amount), decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${frac.padEnd(2, "0")}`;
}

export function short(address: string, n = 4): string {
  return `${address.slice(0, 2 + n)}…${address.slice(-n)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "15 Jan 2027, 08:00:00 UTC", identical on the server and in every browser. */
export function formatTime(input: number | string): string {
  const d = typeof input === "number" ? new Date(input * 1000) : new Date(input);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/** Unix seconds as ["08:00 UTC", "15 Jan 2027"]; "Not a date" for one no calendar has (a changed byte can make one). */
export function formatClock(seconds: bigint | number): [string, string] {
  const d = new Date(Number(seconds) * 1000);
  if (Number.isNaN(d.getTime())) return ["Not a date", ""];
  return [`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`, `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`];
}

/** Unix seconds as "15 Jan 2027, 08:00 UTC". */
export function formatMinute(seconds: bigint | number): string {
  const [time, day] = formatClock(seconds);
  return day ? `${day}, ${time}` : time;
}

export const STATE_LABELS: Record<AddressState, string> = {
  awaiting_funds: "Awaiting funds",
  funded: "Executing",
  failing: "Failing",
  settled: "Settled",
  refunding: "Refunding",
  refunded: "Refunded",
  expired: "Expired",
};

/** Tone per state, for the badge. */
export const STATE_TONES: Record<AddressState, "wait" | "busy" | "bad" | "good" | "done"> = {
  awaiting_funds: "wait",
  funded: "busy",
  failing: "bad",
  settled: "good",
  refunding: "busy",
  refunded: "done",
  expired: "done",
};
