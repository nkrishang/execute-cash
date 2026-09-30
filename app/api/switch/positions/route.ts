import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { perMinute } from "@/lib/rate-limit";
import { CHAINS, type ChainId } from "@/lib/switch";
import { loadCatalog, readPositions } from "@/lib/switch-server";

/** A wallet's positions in the vaults on a chain (those a switch can start and end at), read from the chain. */

const allow = perMinute(30);
const fail = (status: number, message: string) => NextResponse.json({ error: { code: "invalid_request", message, issues: [] } }, { status });

export async function GET(req: NextRequest) {
  if (!allow(req)) return fail(429, "Try again in a minute.");
  const q = req.nextUrl.searchParams;
  const chainId = Number(q.get("chainId"));
  const wallet = q.get("wallet") ?? "";
  if (!(chainId in CHAINS)) return fail(400, "Pick Base, Monad or Arc");
  if (!isAddress(wallet)) return fail(400, "Pass ?wallet=0x…");
  const vaults = (await loadCatalog()).filter((v) => v.chainId === chainId);
  try {
    const positions = await readPositions(chainId as ChainId, getAddress(wallet), vaults);
    return NextResponse.json({ positions }, { headers: { "cache-control": "no-store" } });
  } catch {
    return fail(502, "Couldn’t read the wallet’s positions. Try again.");
  }
}
