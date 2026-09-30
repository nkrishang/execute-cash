import { NextResponse, type NextRequest } from "next/server";
import { perMinute } from "@/lib/rate-limit";
import { quote, resolvePair, roomIn, usdOf } from "@/lib/switch-server";

/** What a switch of these source shares would move right now: what they redeem for, and how many destination shares that buys. */

const allow = perMinute(120);
const fail = (status: number, message: string) => NextResponse.json({ error: { code: "invalid_request", message, issues: [] } }, { status });

export async function GET(req: NextRequest) {
  if (!allow(req)) return fail(429, "Too many quotes. Try again in a minute.");
  const q = req.nextUrl.searchParams;
  const pair = await resolvePair(q.get("chainId"), q.get("from"), q.get("to"));
  if (!pair.ok) return fail(400, pair.message);
  const shares = q.get("shares") ?? "";
  if (!/^[1-9]\d{0,40}$/.test(shares)) return fail(400, "Pass ?shares= in base units, as a string");
  try {
    const [r, room] = await Promise.all([quote(pair.chainId, pair.from.address, pair.to.address, BigInt(shares)), roomIn(pair.to)]);
    if (r.assets === 0n) return fail(400, "Those shares redeem for nothing");
    if (room !== null && r.assets > room) return fail(400, `${pair.to.name} is full right now`);
    return NextResponse.json(
      { shares: r.shares.toString(), assets: r.assets.toString(), depositShares: r.depositShares.toString(), usd: usdOf(pair.from, r.assets) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return fail(502, "Couldn’t read the vaults. Try again.");
  }
}
