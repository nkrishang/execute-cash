/*
 * The vault share tokens Switch (execute.cash/morpho) needs Execute to accept, as config for
 * gum-indexer and execute-server: every Morpho vault listed on Base, Monad and Arc with at least
 * $50k in it, no share or asset gates, and another listed vault with the same asset on its chain to
 * switch into. Each token's symbol and decimals are read from its chain; symbols that repeat on a
 * chain get the address's last four characters, as both services key tokens by symbol.
 *
 *   node scripts/switch-tokens.mts > switch-tokens.txt
 *
 * RPCs default to each chain's public endpoint; set BASE_RPC_URL, MONAD_RPC_URL or ARC_RPC_URL.
 */

import { createPublicClient, erc20Abi, getAddress, http, type Address } from "viem";

const CHAINS = [
  { id: 8453, key: "base", rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org" },
  { id: 143, key: "monad", rpc: process.env.MONAD_RPC_URL || "https://rpc.monad.xyz" },
  { id: 5042, key: "arc", rpc: process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io" },
];
const MIN_USD = 50_000;
const ZERO = "0x0000000000000000000000000000000000000000";

type Vault = { chainId: number; address: Address; name: string; asset: string; usd: number };

async function graphql<T>(query: string): Promise<T> {
  const res = await fetch("https://api.morpho.org/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? `Morpho's API answered ${res.status}`);
  return body.data;
}

async function vaults(chainId: number): Promise<Vault[]> {
  const out: Vault[] = [];
  for (let skip = 0; ; skip += 100) {
    const { vaults: v1 } = await graphql<{ vaults: { items: { address: string; name: string; listed: boolean; asset: { address: string }; state: { totalAssetsUsd: number | null } | null }[] } }>(
      `{ vaults(first: 100, skip: ${skip}, where: { chainId_in: [${chainId}] }) { items { address name listed asset { address } state { totalAssetsUsd } } } }`,
    );
    for (const v of v1.items) {
      if (v.listed && (v.state?.totalAssetsUsd ?? 0) >= MIN_USD) out.push({ chainId, address: getAddress(v.address), name: v.name, asset: v.asset.address.toLowerCase(), usd: v.state!.totalAssetsUsd! });
    }
    if (v1.items.length < 100) break;
  }
  for (let skip = 0; ; skip += 100) {
    const { vaultV2s: v2 } = await graphql<{
      vaultV2s: {
        items: {
          address: string;
          name: string;
          listed: boolean;
          asset: { address: string };
          totalAssetsUsd: number | null;
          gatesConfig: Record<string, { address: string | null } | null> | null;
        }[];
      };
    }>(
      `{ vaultV2s(first: 100, skip: ${skip}, where: { chainId_in: [${chainId}] }) { items { address name listed asset { address } totalAssetsUsd gatesConfig { sendSharesGate { address } receiveSharesGate { address } sendAssetsGate { address } receiveAssetsGate { address } } } } }`,
    );
    for (const v of v2.items) {
      const gated = Object.values(v.gatesConfig ?? {}).some((g) => !!g?.address && g.address.toLowerCase() !== ZERO);
      if (v.listed && !gated && (v.totalAssetsUsd ?? 0) >= MIN_USD) out.push({ chainId, address: getAddress(v.address), name: v.name, asset: v.asset.address.toLowerCase(), usd: v.totalAssetsUsd! });
    }
    if (v2.items.length < 100) break;
  }
  // Only assets with somewhere to switch to.
  const perAsset = new Map<string, number>();
  for (const v of out) perAsset.set(v.asset, (perAsset.get(v.asset) ?? 0) + 1);
  return out.filter((v) => (perAsset.get(v.asset) ?? 0) >= 2).sort((a, b) => b.usd - a.usd);
}

async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= tries) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

const indexer: string[] = [];
const server: string[] = [];
for (const chain of CHAINS) {
  const client = createPublicClient({ transport: http(chain.rpc) });
  const list = await vaults(chain.id);
  // One call at a time, as public endpoints rate limit bursts.
  const read = [];
  for (const v of list) {
    const symbol = await retry(() => client.readContract({ address: v.address, abi: erc20Abi, functionName: "symbol" }));
    const decimals = await retry(() => client.readContract({ address: v.address, abi: erc20Abi, functionName: "decimals" }));
    read.push({ ...v, symbol: symbol.toUpperCase(), decimals });
  }
  const seen = new Map<string, number>();
  for (const v of read) seen.set(v.symbol, (seen.get(v.symbol) ?? 0) + 1);
  indexer.push(`# ${chain.key}: ${read.length} vaults`);
  server.push(`# ${chain.key}: ${read.length} vaults`);
  for (const v of read) {
    const symbol = (seen.get(v.symbol) ?? 0) > 1 ? `${v.symbol}-${v.address.slice(-4).toUpperCase()}` : v.symbol;
    const comment = `# ${v.name} ($${(v.usd / 1e6).toFixed(1)}M)`;
    indexer.push(comment, `[[chains.${chain.key}.tokens]]`, `symbol = "${symbol}"`, `address = "${v.address}"`, `decimals = ${v.decimals}`, `issuance = "vault"`, "");
    server.push(comment, `[[chains.${chain.key}.tokens]]`, `symbol = "${symbol}"`, `address = "${v.address}"`, `decimals = ${v.decimals}`, "");
  }
}

console.log("## gum-indexer config/default.toml\n");
console.log(indexer.join("\n"));
console.log("\n## execute-server config/default.toml\n");
console.log(server.join("\n"));
