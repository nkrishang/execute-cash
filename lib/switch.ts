import { decodeFunctionData, encodeFunctionData, getAddress, maxUint256, parseAbiItem, zeroAddress, zeroHash, type Address, type Hex } from "viem";
import type { ArgJson, IntentJson } from "@/lib/execute/types";

/*
 * Switch: one executable address that moves a position from one ERC-4626 vault to another with the
 * same asset, on the same chain. The address is paid in the source vault's shares; it withdraws them
 * and deposits what they redeem for into the destination vault, for the wallet, in one transaction.
 *
 * An address can't name itself in its own calls, so the withdrawal goes through a Morpho contract
 * that holds or pulls the shares:
 *
 *   Base, Monad (Bundler3):  1  from.transfer(GeneralAdapter1, shares)
 *                            2  Bundler3.multicall([
 *                                 GeneralAdapter1.erc4626Redeem(from, all of its shares, minSharePriceE27, itself, itself),
 *                                 GeneralAdapter1.erc4626Deposit(to, all of its assets, maxSharePriceE27, wallet),
 *                               ])
 *
 *   Arc (VaultBundlesV1: Arc has no Bundler3, and a bundle takes one call per transaction):
 *                            1  from.approve(VaultBundlesV1, shares)
 *                            2  VaultBundlesV1.vaultBundlesV1Withdraw(from, 0, shares, no permit, no fee, deadline)
 *                                 redeems the shares and pays the assets to the address
 *                            3  asset.approve(to, assets)
 *                            4  to.deposit(assets, wallet)
 *
 * On Arc the address deposits a basis point under the quote: that basis point, and whatever the
 * source vault accrued since the quote, stay behind as dust that only the wallet can recover
 * (`recover` pays the refund address, which is the wallet).
 *
 * Contracts read from each chain on 2026-09-30: GeneralAdapter1 answers BUNDLER3() with the Bundler3
 * below on Base and Monad; VaultBundlesV1 is Morpho's own deployment (morpho-ts `bundles`).
 */

export type ChainId = 8453 | 143 | 5042;

type Route =
  | { kind: "bundler3"; bundler3: Address; adapter: Address }
  | { kind: "vault-bundles"; bundles: Address };

export type SwitchChain = { id: ChainId; name: string; route: Route };

export const CHAINS: Record<ChainId, SwitchChain> = {
  8453: {
    id: 8453,
    name: "Base",
    route: { kind: "bundler3", bundler3: "0x6BFd8137e702540E7A42B74178A4a49Ba43920C4", adapter: "0xb98c948CFA24072e58935BC004a8A7b376AE746A" },
  },
  143: {
    id: 143,
    name: "Monad",
    route: { kind: "bundler3", bundler3: "0x82b684483e844422FD339df0b67b3B111F02c66E", adapter: "0x725AB8CAd931BCb80Fdbf10955a806765cCe00e5" },
  },
  5042: { id: 5042, name: "Arc", route: { kind: "vault-bundles", bundles: "0x76c1dEefAe48523E14903085081Bda2999450b68" } },
};

export const CHAIN_IDS = Object.keys(CHAINS).map(Number) as ChainId[];
export const isChainId = (n: number): n is ChainId => n in CHAINS;

/** A vault as the page shows it: Morpho's listing, and whether Execute accepts its shares. */
export type Vault = {
  chainId: ChainId;
  address: Address;
  name: string;
  /** Its share token's symbol, as wallets show it: "steakUSDC". */
  symbol: string;
  version: 1 | 2;
  /** The vault's own image, or its curator's. */
  image: string | null;
  curator: string | null;
  asset: { address: Address; symbol: string; decimals: number; logo: string | null; usd: number };
  /** Net APY, as a fraction: 0.044 is 4.4%. */
  apy: number;
  depositsUsd: number;
  /** What can be withdrawn from it right now, in USD. */
  liquidityUsd: number;
  /** Whether an address can be paid in its shares: a switch can start here. */
  from: boolean;
};

/** Every vault here issues 18-decimal shares (checked for each one when it was added to Execute's token list). */
export const SHARE_DECIMALS = 18;

/** A wallet's shares in a vault, read from the chain. */
export type Position = { vault: Address; shares: string; assets: string };

/** One vault's daily net APY, oldest first: [unix seconds, fraction]. */
export type History = [number, number][];

/** Every contract a switch calls on a chain: none of them can be the wallet the new shares go to. */
export function helpersOf(chainId: ChainId): Address[] {
  const route = CHAINS[chainId].route;
  return route.kind === "bundler3" ? [route.bundler3, route.adapter] : [route.bundles];
}

/** A switch moves at least $1, valued at the asset's price. */
export const MIN_USD = 1;

/** How far the destination's share price may rise between the quote and the deposit, in basis points. */
export const DEPOSIT_TOLERANCE_BPS = 10n;
/** How far what the shares redeem for may fall, in basis points: a vault's share price only falls when it realises a loss. */
export const REDEEM_TOLERANCE_BPS = 1n;

const E27 = 10n ** 27n;

type Common = {
  chainId: ChainId;
  /** The source vault: its share token is what the address is paid in. */
  from: Address;
  /** The destination vault. */
  to: Address;
  /** Source vault shares the address is paid. */
  shares: bigint;
  /** The destination: where the new shares go, and where the old ones go if the switch can't happen. */
  wallet: Address;
  expirationTimestamp: number;
  salt: Hex;
};

/** A switch, as the address commits to it: each route commits to its own bounds. */
export type SwitchTerms = Common &
  (
    | {
        route: "bundler3";
        /** The least the redemption may pay per share: asset base units per share, scaled by 1e27. */
        minRedeemPriceE27: bigint;
        /** The most the deposit may cost per share, on the same scale. */
        maxDepositPriceE27: bigint;
      }
    | {
        route: "vault-bundles";
        /** Both vaults' asset, which the address approves to the destination. */
        asset: Address;
        /** Exactly what the address deposits: a basis point under the quote. */
        depositAssets: bigint;
      }
  );

/** A quote: what `shares` redeem for now, and how many destination shares that buys. */
export type Quote = { shares: bigint; assets: bigint; depositShares: bigint };

/** The terms for a quote on a chain, with the route's bounds. */
export function termsFor(common: Common, quote: Quote, asset: Address): SwitchTerms {
  const least = (quote.assets * (10_000n - REDEEM_TOLERANCE_BPS)) / 10_000n;
  if (CHAINS[common.chainId].route.kind === "vault-bundles") return { ...common, route: "vault-bundles", asset, depositAssets: least };
  const minRedeemPriceE27 = (least * E27) / quote.shares;
  const price = (quote.assets * E27 + quote.depositShares - 1n) / quote.depositShares;
  return { ...common, route: "bundler3", minRedeemPriceE27, maxDepositPriceE27: (price * (10_000n + DEPOSIT_TOLERANCE_BPS) + 9_999n) / 10_000n };
}

/** The least the switch accepts for the shares, in asset base units. */
export const leastAssets = (t: SwitchTerms) => (t.route === "bundler3" ? (t.minRedeemPriceE27 * t.shares) / E27 : t.depositAssets);

// ---- The calls ------------------------------------------------------------------------------------

const TRANSFER = "transfer(address to, uint256 amount)";
const APPROVE = "approve(address spender, uint256 amount)";
const DEPOSIT = "deposit(uint256 assets, address receiver)";
const MULTICALL = "multicall((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] bundle)";
const WITHDRAW =
  "vaultBundlesV1Withdraw(address vault, uint256 assets, uint256 shares, (uint256 value, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s) sharesPermit, uint256 referralFeePct, address referralFeeRecipient, uint256 deadline)";

const REDEEM_ITEM = parseAbiItem("function erc4626Redeem(address vault, uint256 shares, uint256 minSharePriceE27, address receiver, address owner)");
const DEPOSIT_ITEM = parseAbiItem("function erc4626Deposit(address vault, uint256 assets, uint256 maxSharePriceE27, address receiver)");

/** The intent, in the API's canonical form: what it answers `POST /v1/address/create` with. */
export function switchIntent(t: SwitchTerms): IntentJson {
  const route = CHAINS[t.chainId].route;
  const shares = t.shares.toString();
  const wallet = getAddress(t.wallet);
  const from = getAddress(t.from);
  const to = getAddress(t.to);
  const head = { token: from, amount: shares };
  const tail = { expirationTimestamp: t.expirationTimestamp, recovery: wallet, salt: t.salt, chainId: t.chainId };

  if (route.kind === "bundler3" && t.route === "bundler3") {
    const step = (data: Hex): ArgJson[] => [route.adapter, data, "0", false, zeroHash];
    const redeem = encodeFunctionData({ abi: [REDEEM_ITEM], args: [from, maxUint256, t.minRedeemPriceE27, route.adapter, route.adapter] });
    const deposit = encodeFunctionData({ abi: [DEPOSIT_ITEM], args: [to, maxUint256, t.maxDepositPriceE27, wallet] });
    return {
      ...head,
      calls: [
        { target: from, function: TRANSFER, args: [route.adapter, shares] },
        { target: route.bundler3, function: MULTICALL, args: [[step(redeem), step(deposit)]] },
      ],
      ...tail,
    };
  }
  if (route.kind === "vault-bundles" && t.route === "vault-bundles") {
    const assets = t.depositAssets.toString();
    const noPermit: ArgJson[] = ["0", "0", "0", "0", zeroHash, zeroHash];
    return {
      ...head,
      calls: [
        { target: from, function: APPROVE, args: [route.bundles, shares] },
        { target: route.bundles, function: WITHDRAW, args: [from, "0", shares, noPermit, "0", zeroAddress, String(t.expirationTimestamp)] },
        { target: getAddress(t.asset), function: APPROVE, args: [to, assets] },
        { target: to, function: DEPOSIT, args: [assets, wallet] },
      ],
      ...tail,
    };
  }
  throw new Error(`a ${t.route} switch can't run on chain ${t.chainId}`);
}

/** One spelling for every value, so two intents compare as the calls they make. */
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]` : typeof v === "string" ? JSON.stringify(v.toLowerCase()) : JSON.stringify(v);

const flat = (i: IntentJson) => [i.token, i.amount, i.calls.map((c) => [c.target, c.function, c.args]), i.expirationTimestamp, i.recovery, i.salt, i.chainId];

/**
 * The terms of an intent that is exactly a switch, and null for anything else: the terms are read
 * out of it, and it must be byte for byte what `switchIntent` makes of them.
 */
export function readSwitchIntent(intent: IntentJson): SwitchTerms | null {
  try {
    if (!isChainId(intent.chainId)) return null;
    const common: Common = {
      chainId: intent.chainId,
      from: getAddress(intent.token),
      to: zeroAddress,
      shares: BigInt(intent.amount),
      wallet: getAddress(intent.recovery),
      expirationTimestamp: intent.expirationTimestamp,
      salt: intent.salt as Hex,
    };
    let terms: SwitchTerms;
    if (CHAINS[intent.chainId].route.kind === "bundler3") {
      const bundle = intent.calls[1]?.args[0] as ArgJson[][] | undefined;
      const redeem = decodeFunctionData({ abi: [REDEEM_ITEM], data: bundle?.[0]?.[1] as Hex });
      const deposit = decodeFunctionData({ abi: [DEPOSIT_ITEM], data: bundle?.[1]?.[1] as Hex });
      terms = { ...common, to: deposit.args[0], route: "bundler3", minRedeemPriceE27: redeem.args[2], maxDepositPriceE27: deposit.args[2] };
    } else {
      const [, , approve, deposit] = intent.calls;
      terms = {
        ...common,
        to: getAddress(deposit.target),
        route: "vault-bundles",
        asset: getAddress(approve.target),
        depositAssets: BigInt(deposit.args[0] as string),
      };
    }
    return canon(flat(switchIntent(terms))) === canon(flat(intent)) ? terms : null;
  } catch {
    return null;
  }
}
