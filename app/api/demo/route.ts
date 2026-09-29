import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, zeroAddress } from "viem";
import { demoApiKey, executeApiUrl } from "@/lib/server-env";

/*
 * The docs' live demo: a real executable address on Base that sends 0.000001 USDC back to whoever
 * pays it. The intent is fixed here; a visitor chooses only the address it pays, so this route
 * can't be used to create anything else with Execute's demo key.
 */

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AMOUNT = "1"; // 0.000001 USDC: one of its smallest units.
const LIFETIME_SECS = 300;

/** A few demo addresses per visitor a minute, per server instance. */
const recent = new Map<string, number[]>();
function allow(visitor: string) {
  const now = Date.now();
  const hits = (recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 5) return false;
  if (recent.size > 5000) recent.clear();
  recent.set(visitor, [...hits, now]);
  return true;
}

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message, issues: [] } }, { status });

export async function POST(req: NextRequest) {
  if (!demoApiKey) return fail(503, "demo_unavailable", "The live demo isn’t set up on this deployment.");
  const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(visitor)) return fail(429, "rate_limited", "That’s a lot of demo addresses. Try again in a minute.");

  let recipient: unknown;
  try {
    recipient = ((await req.json()) as { recipient?: unknown }).recipient;
  } catch {
    return fail(400, "invalid_request", "Send { \"recipient\": \"0x…\" }");
  }
  if (typeof recipient !== "string" || !isAddress(recipient)) return fail(400, "invalid_request", "The recipient must be an address");
  if (getAddress(recipient) === zeroAddress) return fail(400, "invalid_request", "The recipient can’t be the zero address");
  const to = getAddress(recipient);

  const intent = {
    token: USDC,
    amount: AMOUNT,
    calls: [{ target: USDC, function: "transfer(address to, uint256 amount)", args: [to, AMOUNT] }],
    expirationTimestamp: Math.floor(Date.now() / 1000) + LIFETIME_SECS,
    recovery: to,
    salt: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
    chainId: 8453,
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${executeApiUrl}/v1/address/create`, {
      method: "POST",
      headers: { authorization: `Bearer ${demoApiKey}`, "content-type": "application/json" },
      body: JSON.stringify(intent),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return fail(502, "upstream_unreachable", "Couldn’t reach the Execute API. Try again.");
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
