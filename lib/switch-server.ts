import "server-only";
import { createPublicClient, fallback, getAddress, http, isAddressEqual, parseAbi, type Address, type PublicClient } from "viem";
import { arc, base, monad } from "viem/chains";
import { CHAINS, type ChainId, type History, type Position, type Vault } from "@/lib/switch";
import type { ChainList } from "@/lib/execute/types";
import { executeApiUrl, rpcUrls } from "@/lib/server-env";

/*
 * What /morpho reads: Morpho's vaults on each chain, which of them Execute accepts the shares of (its
 * API's token list), their APY history, a wallet's positions, and quotes from the vaults themselves.
 */

/*
 * Each chain's RPCs in order, paid first (server-env.ts). Reads made in the same tick go out as one
 * Multicall3 call, at the same address on all three chains (checked 2026-09-30).
 */
const RPCS: Record<ChainId, string[]> = { 8453: rpcUrls.base, 143: rpcUrls.monad, 5042: rpcUrls.arc };
const DEFINITIONS = { 8453: base, 143: monad, 5042: arc } as const;
const connect = (id: ChainId) =>
  createPublicClient({
    chain: DEFINITIONS[id],
    batch: { multicall: true },
    transport: fallback(RPCS[id].map((url) => http(url, { timeout: 8_000, retryCount: 1 }))),
  }) as PublicClient;
const clients: Record<ChainId, PublicClient> = { 8453: connect(8453), 143: connect(143), 5042: connect(5042) };

const VAULT = parseAbi([
  "function asset() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function previewDeposit(uint256) view returns (uint256)",
  "function maxDeposit(address) view returns (uint256)",
]);

/** Vaults below this are left out: too small to move into or out of. */
const MIN_DEPOSITS_USD = 50_000;
const ZERO = "0x0000000000000000000000000000000000000000";

/** A GET, so the answer can be cached; the header is what Morpho's API asks of a GET. */
async function morpho<T>(query: string, revalidate: number): Promise<T> {
  const res = await fetch(`https://api.morpho.org/graphql?query=${encodeURIComponent(query)}`, {
    headers: { "apollo-require-preflight": "true" },
    next: { revalidate },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? `Morpho's API answered ${res.status}`);
  return body.data;
}

type AssetRow = { address: string; symbol: string; decimals: number; logoURI: string | null; price: { usd: number | null } | null };
type V1Row = {
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  metadata: { image: string | null } | null;
  asset: AssetRow;
  state: { totalAssetsUsd: number | null; netApy: number | null; curators: { name: string; image: string | null }[] | null } | null;
  liquidity: { usd: number | null } | null;
};
type V2Row = {
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  metadata: { image: string | null } | null;
  curators: { items: { name: string; image: string | null }[] } | null;
  asset: AssetRow;
  totalAssetsUsd: number | null;
  netApy: number | null;
  liquidityUsd: number | null;
  gatesConfig: Record<string, { address: string | null } | null> | null;
};

const ASSET = "asset { address symbol decimals logoURI price { usd } }";

async function chainVaults(chainId: ChainId, accepted: Set<string>): Promise<Vault[]> {
  const { v1, v2 } = await morpho<{ v1: { items: V1Row[] }; v2: { items: V2Row[] } }>(
    `{
      v1: vaults(first: 200, orderBy: TotalAssetsUsd, orderDirection: Desc, where: { chainId_in: [${chainId}], listed: true }) {
        items { address name symbol listed metadata { image } ${ASSET} state { totalAssetsUsd netApy curators { name image } } liquidity { usd } }
      }
      v2: vaultV2s(first: 200, orderBy: TotalAssetsUsd, orderDirection: Desc, where: { chainId_in: [${chainId}], listed: true }) {
        items {
          address name symbol listed metadata { image } curators { items { name image } } ${ASSET} totalAssetsUsd netApy liquidityUsd
          gatesConfig { sendSharesGate { address } receiveSharesGate { address } sendAssetsGate { address } receiveAssetsGate { address } }
        }
      }
    }`,
    300,
  );
  const asset = (a: AssetRow) => ({ address: getAddress(a.address), symbol: a.symbol, decimals: a.decimals, logo: a.logoURI, usd: a.price?.usd ?? 0 });
  const out: Vault[] = [];
  for (const v of v1.items) {
    const deposits = v.state?.totalAssetsUsd ?? 0;
    if (!v.listed || deposits < MIN_DEPOSITS_USD) continue;
    const curator = v.state?.curators?.[0] ?? null;
    out.push({
      chainId,
      address: getAddress(v.address),
      name: v.name,
      symbol: v.symbol,
      version: 1,
      image: v.metadata?.image ?? curator?.image ?? null,
      curator: curator?.name ?? null,
      asset: asset(v.asset),
      apy: v.state?.netApy ?? 0,
      depositsUsd: deposits,
      liquidityUsd: v.liquidity?.usd ?? 0,
      from: accepted.has(v.address.toLowerCase()),
    });
  }
  for (const v of v2.items) {
    const deposits = v.totalAssetsUsd ?? 0;
    const gated = Object.values(v.gatesConfig ?? {}).some((g) => !!g?.address && g.address.toLowerCase() !== ZERO);
    if (!v.listed || gated || deposits < MIN_DEPOSITS_USD) continue;
    const curator = v.curators?.items[0] ?? null;
    out.push({
      chainId,
      address: getAddress(v.address),
      name: v.name,
      symbol: v.symbol,
      version: 2,
      image: v.metadata?.image ?? curator?.image ?? null,
      curator: curator?.name ?? null,
      asset: asset(v.asset),
      apy: v.netApy ?? 0,
      depositsUsd: deposits,
      liquidityUsd: v.liquidityUsd ?? 0,
      from: accepted.has(v.address.toLowerCase()),
    });
  }
  // Only assets with somewhere to switch to, largest first.
  const count = new Map<string, number>();
  for (const v of out) count.set(v.asset.address, (count.get(v.asset.address) ?? 0) + 1);
  // A curator's V1 vault and its V2 often share a name; moving from one to the other is a switch too.
  const names = new Map<string, number>();
  for (const v of out) names.set(v.name, (names.get(v.name) ?? 0) + 1);
  return out
    .filter((v) => (count.get(v.asset.address) ?? 0) >= 2)
    .map((v) => ((names.get(v.name) ?? 0) > 1 ? { ...v, name: `${v.name} (V${v.version})` } : v))
    .sort((a, b) => b.depositsUsd - a.depositsUsd);
}

/** Execute's chains and the share tokens it accepts on each, from its API. */
async function accepted(): Promise<Map<ChainId, Set<string>>> {
  const res = await fetch(`${executeApiUrl}/v1/chains`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`the Execute API answered ${res.status}`);
  const { chains } = (await res.json()) as ChainList;
  const out = new Map<ChainId, Set<string>>();
  for (const c of chains) if (c.chainId in CHAINS) out.set(c.chainId as ChainId, new Set(c.tokens.map((t) => t.address.toLowerCase())));
  return out;
}

/** Every vault a switch can start or end at, on the chains Execute runs; empty when Morpho's API can't be had. */
export async function loadCatalog(): Promise<Vault[]> {
  try {
    const live = await accepted();
    const lists = await Promise.all([...live.entries()].map(([id, tokens]) => chainVaults(id, tokens)));
    return lists.flat();
  } catch {
    return [];
  }
}

export async function findVault(chainId: ChainId, address: Address): Promise<Vault | null> {
  return (await loadCatalog()).find((v) => v.chainId === chainId && isAddressEqual(v.address, address)) ?? null;
}

/** A switch's two vaults from a request's values, or what's wrong with them. */
export async function resolvePair(
  chainId: unknown,
  from: unknown,
  to: unknown,
): Promise<{ ok: true; chainId: ChainId; from: Vault; to: Vault } | { ok: false; message: string }> {
  const id = Number(chainId);
  if (!Number.isInteger(id) || !(id in CHAINS)) return { ok: false, message: "Pick Base, Monad or Arc" };
  if (typeof from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(from)) return { ok: false, message: "The vault to switch from must be an address" };
  if (typeof to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to)) return { ok: false, message: "The vault to switch to must be an address" };
  const [a, b] = await Promise.all([findVault(id as ChainId, from as Address), findVault(id as ChainId, to as Address)]);
  if (!a) return { ok: false, message: "That vault isn’t one this page can switch from" };
  if (!a.from) return { ok: false, message: `Execute doesn’t accept ${a.name}’s shares yet` };
  if (!b) return { ok: false, message: "That vault isn’t one this page can switch into" };
  if (isAddressEqual(a.address, b.address)) return { ok: false, message: "Pick a different vault to switch into" };
  if (!isAddressEqual(a.asset.address, b.asset.address)) return { ok: false, message: `${b.name} holds ${b.asset.symbol}, not ${a.asset.symbol}` };
  return { ok: true, chainId: id as ChainId, from: a, to: b };
}

/** An amount of a vault's asset in USD, from Morpho's price. */
export const usdOf = (vault: Vault, assets: bigint) => (Number(assets) / 10 ** vault.asset.decimals) * vault.asset.usd;

/** The last 30 days of daily net APY for each vault, cached for an hour. */
export async function loadHistory(vaults: Vault[]): Promise<Record<string, History>> {
  // Anchored to the day, so the query (and its cache entry) only changes once a day.
  const start = Math.floor(Date.now() / 86_400_000) * 86_400 - 30 * 86_400;
  const options = `options: { startTimestamp: ${start}, interval: DAY }`;
  const fields = vaults.map((v, i) =>
    v.version === 1
      ? `v${i}: vaultByAddress(address: "${v.address}", chainId: ${v.chainId}) { historicalState { series: dailyNetApy(${options}) { x y } } }`
      : `v${i}: vaultV2ByAddress(address: "${v.address}", chainId: ${v.chainId}) { historicalState { series: avgNetApy(${options}, lookbackHours: 24) { x y } } }`,
  );
  try {
    const data = await morpho<Record<string, { historicalState: { series: { x: number; y: number | null }[] } } | null>>(`{ ${fields.join("\n")} }`, 3600);
    return Object.fromEntries(
      vaults.map((v, i) => [
        v.address,
        (data[`v${i}`]?.historicalState.series ?? [])
          .filter((p) => p.y !== null)
          .map((p) => [p.x, p.y as number] as [number, number])
          .sort((a, b) => a[0] - b[0]),
      ]),
    );
  } catch {
    return {};
  }
}

/** A wallet's shares in the given vaults, read from the chain in two batched calls, where it holds any. */
export async function readPositions(chainId: ChainId, wallet: Address, vaults: Vault[]): Promise<Position[]> {
  const client = clients[chainId];
  const balances = await client.multicall({
    allowFailure: false,
    contracts: vaults.map((v) => ({ address: v.address, abi: VAULT, functionName: "balanceOf", args: [wallet] }) as const),
  });
  const held = vaults.map((v, i) => ({ vault: v.address, shares: balances[i] as bigint })).filter((p) => p.shares > 0n);
  if (held.length === 0) return [];
  const assets = await client.multicall({
    allowFailure: false,
    contracts: held.map((p) => ({ address: p.vault, abi: VAULT, functionName: "convertToAssets", args: [p.shares] }) as const),
  });
  return held.map((p, i) => ({ vault: p.vault, shares: p.shares.toString(), assets: (assets[i] as bigint).toString() }));
}

/** What `shares` of `from` redeem for now, and how many shares of `to` that buys; checked to share an asset. */
export async function quote(chainId: ChainId, from: Address, to: Address, shares: bigint) {
  const client = clients[chainId];
  const [assetA, assetB, assets] = await Promise.all([
    client.readContract({ address: from, abi: VAULT, functionName: "asset" }),
    client.readContract({ address: to, abi: VAULT, functionName: "asset" }),
    client.readContract({ address: from, abi: VAULT, functionName: "previewRedeem", args: [shares] }),
  ]);
  if (!isAddressEqual(assetA, assetB)) throw new Error("the vaults hold different assets");
  const depositShares = assets > 0n ? await client.readContract({ address: to, abi: VAULT, functionName: "previewDeposit", args: [assets] }) : 0n;
  return { asset: getAddress(assetA), shares, assets, depositShares };
}

/**
 * How much more a vault takes now, in its asset's base units: a V1 vault stops at its markets' caps
 * (its maxDeposit ignores who deposits). A V2 vault's maxDeposit is always 0, so there's no telling: null.
 */
export async function roomIn(vault: Vault): Promise<bigint | null> {
  if (vault.version !== 1) return null;
  return clients[vault.chainId].readContract({ address: vault.address, abi: VAULT, functionName: "maxDeposit", args: [ZERO] });
}
