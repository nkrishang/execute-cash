import "server-only";
import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { MARKET_ID, MORPHO, VAULT } from "@/lib/bitso";
import { rpcUrls } from "@/lib/server-env";

/*
 * What /bitso reads from Base and from Morpho: the vault's quote behind each address it creates, the
 * collateral a wallet ends up with, and the rates the page shows.
 */

const client = createPublicClient({ chain: base, transport: fallback(rpcUrls.base.map((url) => http(url, { timeout: 8_000, retryCount: 1 }))) });

const VAULT_ABI = parseAbi([
  "function previewDeposit(uint256 assets) view returns (uint256 shares)",
  "function convertToAssets(uint256 shares) view returns (uint256 assets)",
]);
const MORPHO_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

/** The bitusdcp a deposit of `assets` USDC base units would mint now. */
export const previewDeposit = (assets: bigint) =>
  client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "previewDeposit", args: [assets] });

/** A wallet's collateral in the bitusdcp/MXNB market: bitusdcp, and what it redeems for in USDC. */
export async function readCollateral(wallet: Address): Promise<{ shares: bigint; assets: bigint }> {
  const [, , shares] = await client.readContract({ address: MORPHO, abi: MORPHO_ABI, functionName: "position", args: [MARKET_ID, wallet] });
  const assets = shares > 0n ? await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "convertToAssets", args: [shares] }) : 0n;
  return { shares, assets };
}

/** Morpho's own figures for the two products, as fractions (0.0418 is 4.18%) and MXNB base units. */
export type Rates = { vaultApy: number; borrowApy: number; mxnbAvailable: string };

const RATES_QUERY = `{
  vaultV2ByAddress(address: "${VAULT}", chainId: 8453) { netApy }
  marketById(marketId: "${MARKET_ID}", chainId: 8453) { state { borrowApy liquidityAssets } }
}`;

/** From Morpho's API, refreshed every five minutes; null when it can't be had. */
export async function loadRates(): Promise<Rates | null> {
  try {
    const url = `https://api.morpho.org/graphql?query=${encodeURIComponent(RATES_QUERY)}`;
    // A GET, so the answer can be cached; the header is what Morpho's API asks of a GET.
    const res = await fetch(url, { headers: { "apollo-require-preflight": "true" }, next: { revalidate: 300 }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { vaultV2ByAddress?: { netApy?: number }; marketById?: { state?: { borrowApy?: number; liquidityAssets?: number | string } } };
    };
    const vaultApy = body.data?.vaultV2ByAddress?.netApy;
    const state = body.data?.marketById?.state;
    if (typeof vaultApy !== "number" || typeof state?.borrowApy !== "number" || state.liquidityAssets == null) return null;
    return { vaultApy, borrowApy: state.borrowApy, mxnbAvailable: BigInt(state.liquidityAssets).toString() };
  } catch {
    return null;
  }
}
