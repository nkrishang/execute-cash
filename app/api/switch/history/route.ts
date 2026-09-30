import { NextResponse, type NextRequest } from "next/server";
import { isAddressEqual } from "viem";
import { perMinute } from "@/lib/rate-limit";
import { CHAINS } from "@/lib/switch";
import { loadCatalog, loadHistory } from "@/lib/switch-server";

/** Thirty days of daily net APY for up to two vaults, from Morpho's API. */

const allow = perMinute(60);
const fail = (status: number, message: string) => NextResponse.json({ error: { code: "invalid_request", message, issues: [] } }, { status });

export async function GET(req: NextRequest) {
  if (!allow(req)) return fail(429, "Try again in a minute.");
  const q = req.nextUrl.searchParams;
  const chainId = Number(q.get("chainId"));
  if (!(chainId in CHAINS)) return fail(400, "Pick Base, Monad or Arc");
  const wanted = q.getAll("vault").slice(0, 2);
  const catalog = await loadCatalog();
  const vaults = catalog.filter((v) => v.chainId === chainId && wanted.some((w) => /^0x[0-9a-fA-F]{40}$/.test(w) && isAddressEqual(w as `0x${string}`, v.address)));
  if (vaults.length === 0) return fail(400, "Pass one or two vaults: ?vault=0x…");
  return NextResponse.json({ history: await loadHistory(vaults) }, { headers: { "cache-control": "public, max-age=600" } });
}
