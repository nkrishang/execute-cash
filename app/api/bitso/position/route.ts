import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { readCollateral } from "@/lib/bitso-server";

/** A wallet's collateral in Bitso's MXNB market, for /bitso once its address has settled. */

/** Plenty for a page polling once, per visitor a minute, per server instance. */
const recent = new Map<string, number[]>();
function allow(visitor: string) {
  const now = Date.now();
  const hits = (recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 30) return false;
  if (recent.size > 5000) recent.clear();
  recent.set(visitor, [...hits, now]);
  return true;
}

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message, issues: [] } }, { status });

export async function GET(req: NextRequest) {
  const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(visitor)) return fail(429, "rate_limited", "Try again in a minute.");
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return fail(400, "invalid_request", "Pass ?wallet=0x…");
  try {
    const { shares, assets } = await readCollateral(getAddress(wallet));
    return NextResponse.json({ shares: shares.toString(), assets: assets.toString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return fail(502, "upstream_unreachable", "Couldn’t read the position from Base.");
  }
}
