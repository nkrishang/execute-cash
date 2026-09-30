import { formatUnits, parseUnits } from "viem";
import { SHARE_DECIMALS } from "@/lib/switch";

/** A token amount for people: two decimals from 1 up, up to six significant ones below it. "1,000.00", "0.0025". */
export function token(units: bigint | string, decimals: number): string {
  const value = Number(formatUnits(BigInt(units), decimals));
  if (value === 0) return "0.00";
  if (value >= 1) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

/** A share amount as a wallet takes it: every digit it has, commas left out. */
export const exactShares = (units: bigint | string) => formatUnits(BigInt(units), SHARE_DECIMALS);

/** Shares for people: up to six decimals, trimmed. */
export const shares = (units: bigint | string) =>
  Number(formatUnits(BigInt(units), SHARE_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 6 });

/** A fraction as a percentage: 0.0441 is "4.41%". */
export const percent = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;

/** A difference in percentage points, signed: "+1.49"; one that rounds away is "0.00". */
export function points(x: number): string {
  const text = Math.abs(x * 100).toFixed(2);
  return text === "0.00" ? text : `${x > 0 ? "+" : "−"}${text}`;
}

/** Dollars, compact past a thousand: "$412K", "$38.9M". */
export function usd(x: number): string {
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(x >= 1e8 ? 0 : 1)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${x.toFixed(2)}`;
}

/** What someone typed as an amount of a token, in base units; null when it isn't one. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const value = input.trim().replace(/,/g, "");
  if (!value || value === "." || !/^\d*\.?\d*$/.test(value)) return null;
  const [, frac = ""] = value.split(".");
  if (frac.length > decimals) return null;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

/** Unix seconds as "Sep 30". */
export function day(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
