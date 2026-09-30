import { decodeFunctionData, encodeFunctionData, formatUnits, getAddress, maxUint256, parseAbiItem, zeroHash, type Address, type Hex } from "viem";
import type { ArgJson, IntentJson } from "@/lib/execute/types";

/*
 * Bitso's two Morpho products on Base as one executable address. USDC goes into Bitso USDC Prime, a
 * Morpho vault, and the vault's shares (bitusdcp) go straight in as collateral in Bitso's
 * bitusdcp/MXNB market, credited to the user's wallet. The collateral keeps earning the vault's yield,
 * and the wallet can borrow MXNB against it on Morpho.
 *
 * The second step spends whatever the first one minted, and an executable address's calldata is fixed
 * before any USDC arrives. So both run through Morpho's own bundler: the USDC goes to its
 * GeneralAdapter1, which deposits exactly the amount (keeping the shares), then supplies all of its
 * shares as collateral on the wallet's behalf, in the same transaction.
 *
 *   1  USDC.transfer(GeneralAdapter1, amount)
 *   2  Bundler3.multicall([
 *        GeneralAdapter1.erc4626Deposit(Bitso USDC Prime, amount, maxSharePriceE27, GeneralAdapter1),
 *        GeneralAdapter1.morphoSupplyCollateral(bitusdcp/MXNB market, all of its shares, wallet, 0x),
 *      ])
 *
 * Borrowing stays with the wallet. Morpho lets only a position's owner, or whom the owner authorized,
 * borrow against it, so no address anyone else created can take on debt in the user's name.
 *
 * Contracts read from Base on 2026-09-30: the market's parameters hash to MARKET_ID, and
 * GeneralAdapter1 answers BUNDLER3() and MORPHO() with the addresses below.
 */

export const CHAIN_ID = 8453;

export const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Bitso USDC Prime: a Morpho Vault V2 (ERC-4626) whose share token is bitusdcp, 18 decimals. */
export const VAULT: Address = "0x39E18c066187c83e860801Befe45aE8ecd021575";
export const MXNB: Address = "0xF197FFC28c23E0309B5559e7a166f2c6164C80aA";
export const MORPHO: Address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
export const BUNDLER3: Address = "0x6BFd8137e702540E7A42B74178A4a49Ba43920C4";
export const ADAPTER: Address = "0xb98c948CFA24072e58935BC004a8A7b376AE746A";

/** Bitso's market lending MXNB against bitusdcp. */
export const MARKET = {
  loanToken: MXNB,
  collateralToken: VAULT,
  oracle: "0x365A1F98AB846062bf5842deBFd2e7AaD40C5e83" as Address,
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687" as Address,
  lltv: 915_000_000_000_000_000n,
} as const;
export const MARKET_ID: Hex = "0xd4c235d7c717d4ccf2cadb0f2ebc9239695530ef04ca9739fa74f5749cc19fa0";

export const VAULT_URL = `https://app.morpho.org/base/vault/${VAULT}/bitso-usdc-prime`;
export const MARKET_URL = `https://app.morpho.org/base/variable/${MARKET_ID}/mxnb-bitusdcp`;

/** Every contract the flow touches: none of them can be the wallet the collateral is credited to. */
export const CONTRACTS: Address[] = [USDC, VAULT, MXNB, MORPHO, BUNDLER3, ADAPTER, MARKET.oracle, MARKET.irm];

/** At least 1 USDC, and at most 10: a deliberately small cap on what this page takes, for now. */
export const MIN_AMOUNT = 1_000_000n;
export const MAX_AMOUNT = 10_000_000n;

/** The limits as people read them: "1" and "10". */
export const MIN_USDC = formatUnits(MIN_AMOUNT, 6);
export const MAX_USDC = formatUnits(MAX_AMOUNT, 6);

/**
 * How far the vault's share price may rise between the quote and the deposit, in basis points. It
 * accrues about a millionth an hour, so anything past this means someone moved it.
 */
export const SHARE_PRICE_TOLERANCE_BPS = 10n;

// ---- The calls ------------------------------------------------------------------------------------

const TRANSFER = "transfer(address to, uint256 amount)";
const MULTICALL = "multicall((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] bundle)";

const ERC4626_DEPOSIT = parseAbiItem("function erc4626Deposit(address vault, uint256 assets, uint256 maxSharePriceE27, address receiver)");
const SUPPLY_COLLATERAL = parseAbiItem(
  "function morphoSupplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data)",
);

/** What makes one of these addresses different from another. */
export type BitsoTerms = {
  /** Where the collateral is credited, and where USDC goes back if it can't be. */
  wallet: Address;
  /** USDC base units. */
  amount: bigint;
  /** GeneralAdapter1's bound on the deposit: the most USDC base units per share, scaled by 1e27. */
  maxSharePriceE27: bigint;
  expirationTimestamp: number;
  salt: Hex;
};

/** `assets * 1e27 / shares`, rounded up as GeneralAdapter1 checks it, plus the tolerance. */
export function maxSharePriceFor(assets: bigint, shares: bigint): bigint {
  const price = (assets * 10n ** 27n + shares - 1n) / shares;
  return (price * (10_000n + SHARE_PRICE_TOLERANCE_BPS) + 9_999n) / 10_000n;
}

/** A share price bound as USDC per bitusdcp: "1.0167". */
export const sharePriceText = (maxSharePriceE27: bigint) => formatUnits(maxSharePriceE27, 15);

export const depositData = (amount: bigint, maxSharePriceE27: bigint): Hex =>
  encodeFunctionData({ abi: [ERC4626_DEPOSIT], args: [VAULT, amount, maxSharePriceE27, ADAPTER] });

export const supplyData = (wallet: Address): Hex =>
  encodeFunctionData({ abi: [SUPPLY_COLLATERAL], args: [MARKET, maxUint256, wallet, "0x"] });

/** The intent, in the API's canonical form: what it answers `POST /v1/address/create` with. */
export function bitsoIntent(t: BitsoTerms): IntentJson {
  const amount = t.amount.toString();
  const step = (data: Hex): ArgJson[] => [ADAPTER, data, "0", false, zeroHash];
  return {
    token: USDC,
    amount,
    calls: [
      { target: USDC, function: TRANSFER, args: [ADAPTER, amount] },
      { target: BUNDLER3, function: MULTICALL, args: [[step(depositData(t.amount, t.maxSharePriceE27)), step(supplyData(getAddress(t.wallet)))]] },
    ],
    expirationTimestamp: t.expirationTimestamp,
    recovery: getAddress(t.wallet),
    salt: t.salt,
    chainId: CHAIN_ID,
  };
}

/** One spelling for every value, so two intents compare as the calls they make. */
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]` : typeof v === "string" ? JSON.stringify(v.toLowerCase()) : JSON.stringify(v);

const sameIntent = (a: IntentJson, b: IntentJson) =>
  canon([a.token, a.amount, a.calls.map((c) => [c.target, c.function, c.args]), a.expirationTimestamp, a.recovery, a.salt, a.chainId]) ===
  canon([b.token, b.amount, b.calls.map((c) => [c.target, c.function, c.args]), b.expirationTimestamp, b.recovery, b.salt, b.chainId]);

/**
 * The terms of an intent that is exactly this flow, and null for anything else: the terms are read
 * out of it, and it must be byte for byte what `bitsoIntent` makes of them.
 */
export function readBitsoIntent(intent: IntentJson): BitsoTerms | null {
  try {
    const bundle = intent.calls[1]?.args[0] as ArgJson[][] | undefined;
    const deposit = decodeFunctionData({ abi: [ERC4626_DEPOSIT], data: bundle?.[0]?.[1] as Hex });
    const terms: BitsoTerms = {
      wallet: getAddress(intent.recovery),
      amount: BigInt(intent.amount),
      maxSharePriceE27: deposit.args[2],
      expirationTimestamp: intent.expirationTimestamp,
      salt: intent.salt as Hex,
    };
    return sameIntent(intent, bitsoIntent(terms)) ? terms : null;
  } catch {
    return null;
  }
}
