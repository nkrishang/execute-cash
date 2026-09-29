import { DOCS } from "@/lib/links";

/*
 * What the docs are made of: their pages in order, and the facts they quote. Chains, tokens and
 * contracts here mirror execute-server's config and gum-contracts; the factory was checked on
 * every chain below on 2026-09-29.
 */

export type DocPage = { href: string; title: string; method?: "GET" | "POST" };
export type DocSection = { title: string | null; pages: DocPage[] };

export const DOC_SECTIONS: DocSection[] = [
  { title: null, pages: [{ href: DOCS.home, title: "Welcome" }] },
  {
    title: "Execute API",
    pages: [
      { href: DOCS.quickstart, title: "Quickstart" },
      { href: DOCS.authentication, title: "Authentication" },
      { href: DOCS.createAddress, title: "Create an address", method: "POST" },
      { href: DOCS.getAddress, title: "Look up an address", method: "GET" },
      { href: DOCS.addressStatus, title: "Get an address’s status", method: "GET" },
      { href: DOCS.chains, title: "List chains", method: "GET" },
      { href: DOCS.webhooks, title: "Webhooks" },
      { href: DOCS.errors, title: "Errors" },
    ],
  },
  {
    title: "Guides",
    pages: [
      { href: DOCS.guides, title: "All guides" },
      { href: DOCS.payments, title: "Stablecoin payments" },
      { href: DOCS.morpho, title: "Earn with Morpho" },
      { href: DOCS.spark, title: "Earn with Spark" },
      { href: DOCS.aave, title: "Earn with Aave" },
    ],
  },
  {
    title: "Resources",
    pages: [
      { href: DOCS.howItWorks, title: "How it works" },
      { href: DOCS.supportedChains, title: "Supported chains" },
      { href: DOCS.openSource, title: "Open source" },
    ],
  },
];

export const DOC_PAGES = DOC_SECTIONS.flatMap((s) => s.pages);

// ---- The API and its contracts -------------------------------------------------------------------

export const API_HOST = "api.execute.cash";
export const API_URL = `https://${API_HOST}/v1`;

export const FACTORY = "0x6D85B9706D8f076cB8A9fEA37d70Fcb8D22C2952";
/** The factory's first creation: the code behind every executable address's `recover`. */
export const IMPLEMENTATION = "0xbB6584608a15ce2574F2a6EaE8F2aCC59cEEa502";

export const GITHUB = "https://github.com/nkrishang";
export const CONTRACTS_REPO = `${GITHUB}/gum-contracts`;
export const PAYMENT_SOURCE = `${CONTRACTS_REPO}/blob/main/src/Payment.sol`;
export const FACTORY_SOURCE = `${CONTRACTS_REPO}/blob/main/src/PaymentFactory.sol`;

// ---- Chains --------------------------------------------------------------------------------------

export type DocToken = { symbol: string; address: string };
export type DocChain = { name: string; id: number; explorer: { name: string; url: string }; tokens: DocToken[]; live: boolean };

export const CHAINS: DocChain[] = [
  {
    name: "Monad",
    id: 143,
    explorer: { name: "Monadscan", url: "https://monadscan.com" },
    tokens: [
      { symbol: "USDC", address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" },
      { symbol: "USDT", address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D" },
      { symbol: "AUSD", address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" },
    ],
    live: true,
  },
  {
    name: "Arbitrum One",
    id: 42161,
    explorer: { name: "Arbiscan", url: "https://arbiscan.io" },
    tokens: [
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
    ],
    live: true,
  },
  {
    name: "Base",
    id: 8453,
    explorer: { name: "Basescan", url: "https://basescan.org" },
    tokens: [{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }],
    live: true,
  },
  {
    name: "Arc",
    id: 5042,
    explorer: { name: "Arc Explorer", url: "https://explorer.arc.io" },
    tokens: [{ symbol: "USDC", address: "0x3600000000000000000000000000000000000000" }],
    live: false,
  },
];

// ---- Contracts the guides call, on Base ----------------------------------------------------------

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const MORPHO_VAULT = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
export const SPARK_VAULT = "0x3128a0F7f0ea68E7B7c9B00AFa7E41045828e858";
export const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

/** An example user (nobody holds its key): where shares, payments and refunds go in the examples. */
export const EXAMPLE_USER = "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086";
export const EXAMPLE_MERCHANT = "0x9F0E8F6D3B1a2c4E5d7F8091a2b3C4D5E6F70819";

// ---- Examples, with the addresses PaymentFactory gives them (read from Base, 2026-09-29) --------------

export const EXAMPLE_EXPIRY = 1790671800;

/** 25 USDC to a merchant. */
export const PAYMENT_EXAMPLE = {
  intent: {
    token: BASE_USDC,
    amount: "25000000",
    calls: [{ target: BASE_USDC, function: "transfer(address to, uint256 amount)", args: [EXAMPLE_MERCHANT, "25000000"] }],
    expirationTimestamp: EXAMPLE_EXPIRY,
    recovery: EXAMPLE_USER,
    salt: "0x2f1c5b0a9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a291807f6e5d4c3b2a19080",
    chainId: 8453,
  },
  address: "0x7dFDdbf4b14DB25b020fBF8679a2e688613a2f35",
};

/** How it works' example: 100 USDC into an ERC-4626 vault (Morpho's Steakhouse Prime USDC), shares to the user. */
export const VAULT_EXAMPLE = {
  intent: {
    token: BASE_USDC,
    amount: "100000000",
    calls: [
      { target: BASE_USDC, function: "approve(address spender, uint256 amount)", args: [MORPHO_VAULT, "100000000"] },
      { target: MORPHO_VAULT, function: "deposit(uint256 assets, address receiver)", args: ["100000000", EXAMPLE_USER] },
    ],
    expirationTimestamp: EXAMPLE_EXPIRY,
    recovery: EXAMPLE_USER,
    salt: "0x9d2c4e7a1b3f5d8e0a6c2b4d7f9e1a3c5b8d0f2e4a6c8e1b3d5f7a9c2e4b6d8f",
    chainId: 8453,
  },
  address: "0x092dae7201Cc39437042194D671dDae2628dF860",
};

/** 1,000 USDC into Morpho's Steakhouse Prime USDC vault, shares to the user. */
export const MORPHO_EXAMPLE = {
  intent: {
    token: BASE_USDC,
    amount: "1000000000",
    calls: [
      { target: BASE_USDC, function: "approve(address spender, uint256 amount)", args: [MORPHO_VAULT, "1000000000"] },
      { target: MORPHO_VAULT, function: "deposit(uint256 assets, address receiver)", args: ["1000000000", EXAMPLE_USER] },
    ],
    expirationTimestamp: EXAMPLE_EXPIRY,
    recovery: EXAMPLE_USER,
    salt: "0x4b7ef6dd50ef7570851a0abfbf121fa35edfcdd5f83d07e6bc275547447ec004",
    chainId: 8453,
  },
  address: "0x3a9012C8bbDA720CE9C94458f8753965dFB6455a",
};
