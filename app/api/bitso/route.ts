import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from "viem";
import { CONTRACTS, MAX_AMOUNT, MAX_USDC, MIN_AMOUNT, MIN_USDC, bitsoIntent, maxSharePriceFor } from "@/lib/bitso";
import { previewDeposit } from "@/lib/bitso-server";
import { FACTORY, IMPLEMENTATION } from "@/lib/docs";
import { demoApiKey, executeApiUrl } from "@/lib/server-env";

/*
 * /bitso's executable addresses: USDC into Bitso USDC Prime, the shares posted as collateral in
 * Bitso's MXNB market for the visitor's wallet (lib/bitso.ts). The calls are fixed here; a visitor
 * chooses only the wallet and the amount, so this route can't create anything else with Execute's
 * demo key. The vault is quoted first, to bound the share price the deposit may pay.
 */

/** A little under the API's five minutes, so a clock a moment ahead of the API's can't overshoot it. */
const LIFETIME_SECS = 295;

/** A few addresses per visitor a minute, per server instance. */
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
  if (!demoApiKey) return fail(503, "demo_unavailable", "This page isn’t set up on this deployment.");
  const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(visitor)) return fail(429, "rate_limited", "That’s a lot of addresses. Try again in a minute.");

  let body: { wallet?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail(400, "invalid_request", "Send { \"wallet\": \"0x…\", \"amount\": \"<USDC base units>\" }");
  }
  const { wallet, amount } = body;
  if (typeof wallet !== "string" || !isAddress(wallet)) return fail(400, "invalid_request", "The wallet must be an address");
  const to = getAddress(wallet);
  if (to === zeroAddress) return fail(400, "invalid_request", "The wallet can’t be the zero address");
  if ([...CONTRACTS, FACTORY as Address, IMPLEMENTATION as Address].some((c) => isAddressEqual(c, to))) {
    return fail(400, "invalid_request", "That’s a contract this address calls, not a wallet");
  }
  if (typeof amount !== "string" || !/^[1-9]\d{0,17}$/.test(amount)) return fail(400, "invalid_request", "The amount must be USDC base units, as a string");
  const units = BigInt(amount);
  if (units < MIN_AMOUNT) return fail(400, "invalid_request", `Deposit at least ${MIN_USDC} USDC`);
  if (units > MAX_AMOUNT) return fail(400, "invalid_request", `Deposit at most ${MAX_USDC} USDC`);

  let shares: bigint;
  try {
    shares = await previewDeposit(units);
  } catch {
    return fail(502, "quote_unavailable", "Couldn’t read Bitso USDC Prime’s share price. Try again.");
  }
  if (shares === 0n) return fail(502, "quote_unavailable", "Bitso USDC Prime quoted no shares for that amount.");

  const intent = bitsoIntent({
    wallet: to,
    amount: units,
    maxSharePriceE27: maxSharePriceFor(units, shares),
    expirationTimestamp: Math.floor(Date.now() / 1000) + LIFETIME_SECS,
    salt: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
  });

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
