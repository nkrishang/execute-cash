import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from "viem";
import { FACTORY, IMPLEMENTATION } from "@/lib/docs";
import { perMinute } from "@/lib/rate-limit";
import { MIN_USD, helpersOf, switchIntent, termsFor } from "@/lib/switch";
import { quote, resolvePair, roomIn, usdOf } from "@/lib/switch-server";
import { demoApiKey, executeApiUrl } from "@/lib/server-env";

/*
 * /morpho's executable addresses: paid in one vault's shares, they withdraw them and deposit what
 * they redeem for into another vault with the same asset, for the destination address (`wallet`,
 * lib/switch.ts). The calls are fixed here; a visitor chooses only the chain, the two vaults, the
 * destination and the shares, so this route can't create anything else with Execute's demo key.
 * Both vaults are quoted first, to bound what the switch accepts.
 */

/** A little under the API's five minutes, so a clock a moment ahead of the API's can't overshoot it. */
const LIFETIME_SECS = 295;

const allow = perMinute(5);
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message, issues: [] } }, { status });
const money = (usd: number) => `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd < 10 ? 2 : 0 })}`;

export async function POST(req: NextRequest) {
  if (!demoApiKey) return fail(503, "demo_unavailable", "This page isn’t set up on this deployment.");
  if (!allow(req)) return fail(429, "rate_limited", "That’s a lot of addresses. Try again in a minute.");

  let body: { chainId?: unknown; from?: unknown; to?: unknown; wallet?: unknown; shares?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail(400, "invalid_request", "Send { chainId, from, to, wallet, shares }");
  }
  const pair = await resolvePair(body.chainId, body.from, body.to);
  if (!pair.ok) return fail(400, "invalid_request", pair.message);
  const { chainId, from, to } = pair;

  const { wallet, shares } = body;
  if (typeof wallet !== "string" || !isAddress(wallet)) return fail(400, "invalid_request", "The destination must be an address");
  const owner = getAddress(wallet);
  if (owner === zeroAddress) return fail(400, "invalid_request", "The destination can’t be the zero address");
  const contracts: Address[] = [...helpersOf(chainId), from.address, to.address, FACTORY as Address, IMPLEMENTATION as Address];
  if (contracts.some((c) => isAddressEqual(c, owner))) return fail(400, "invalid_request", "The destination is a contract the switch calls");
  if (typeof shares !== "string" || !/^[1-9]\d{0,40}$/.test(shares)) return fail(400, "invalid_request", "The shares must be base units, as a string");

  let q: Awaited<ReturnType<typeof quote>>;
  let room: bigint | null;
  try {
    [q, room] = await Promise.all([quote(chainId, from.address, to.address, BigInt(shares)), roomIn(to)]);
  } catch {
    return fail(502, "quote_unavailable", "Couldn’t read the vaults’ share prices. Try again.");
  }
  if (room !== null && q.assets > room) return fail(400, "invalid_request", `${to.name} is full right now`);
  if (q.assets === 0n || q.depositShares === 0n) return fail(400, "invalid_request", "Those shares redeem for nothing");
  const usd = usdOf(from, q.assets);
  if (usd < MIN_USD) return fail(400, "invalid_request", `Switch at least ${money(MIN_USD)}`);
  if (usd > from.liquidityUsd) return fail(400, "invalid_request", `${from.name} has only ${money(from.liquidityUsd)} to withdraw right now`);

  const intent = switchIntent(
    termsFor(
      {
        chainId,
        from: from.address,
        to: to.address,
        shares: q.shares,
        wallet: owner,
        expirationTimestamp: Math.floor(Date.now() / 1000) + LIFETIME_SECS,
        salt: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
      },
      q,
      q.asset,
    ),
  );

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
