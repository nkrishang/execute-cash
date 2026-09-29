import { keccak_256 } from "@noble/hashes/sha3.js";
import type { FieldName, Mark } from "@/components/debugger-view";
import { PAYMENT_CREATION_CODE } from "@/components/payment-creation-code";

/*
 * The three executable addresses the verify section steps through: real deposits of 1,000 USDC on
 * Base into a Morpho vault, Spark's savings vault and Aave's USDC market, built as Execute builds
 * them and derived here exactly as PaymentFactory derives them:
 *
 *   terms    = abi.encode(token, amount, calls, expirationTimestamp, recovery, salt, chainId)
 *   initCode = Payment.creationCode ++ abi.encode(factory.paymentImplementation(), terms)
 *   address  = keccak256(0xff ++ factory ++ bytes32(0) ++ keccak256(initCode))[12:]
 *
 * Checked on 2026-09-28: PaymentFactory.paymentAddress on Base returns the same three addresses,
 * and on a fork of Base each one, once funded, executes and leaves the vault's shares with `YOU`.
 */

// ---- Bytes ------------------------------------------------------------------------------------

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function fromHex(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A 32-byte big-endian word. */
function word(v: bigint) {
  const out = new Uint8Array(32);
  for (let i = 31, x = v; i >= 0; i--, x >>= 8n) out[i] = Number(x & 0xffn);
  return out;
}

const addressWord = (a: string) => {
  const w = new Uint8Array(32);
  w.set(fromHex(a), 12);
  return w;
};

/** EIP-55 mixed-case checksum. */
export function checksum(address: string) {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = toHex(keccak_256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

export const readAddress = (b: Uint8Array, at: number) => checksum(toHex(b.subarray(at, at + 20)));

export function readUint(b: Uint8Array, at: number, size = 32) {
  let v = 0n;
  for (let i = 0; i < size; i++) v = (v << 8n) | BigInt(b[at + i]);
  return v;
}

// ---- The factory ------------------------------------------------------------------------------

/** PaymentFactory: the same address on Base, Arbitrum, Monad and Arc. */
export const FACTORY = "0x6D85B9706D8f076cB8A9fEA37d70Fcb8D22C2952";

/** `paymentImplementation()`: the factory's first creation, at its nonce-1 CREATE address. */
const IMPLEMENTATION = toHex(keccak_256(concat(new Uint8Array([0xd6, 0x94]), fromHex(FACTORY), new Uint8Array([1]))).subarray(12));

const CREATION_CODE = fromHex(PAYMENT_CREATION_CODE);

/** The address PaymentFactory derives for these terms: what `paymentAddress(...)` returns. */
export function derive(terms: Uint8Array) {
  const initCode = concat(CREATION_CODE, addressWord(IMPLEMENTATION), word(0x40n), word(BigInt(terms.length)), terms);
  return checksum(toHex(keccak_256(concat(new Uint8Array([0xff]), fromHex(FACTORY), new Uint8Array(32), keccak_256(initCode))).subarray(12)));
}

// ---- What the deposits are made of ------------------------------------------------------------

export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const STEAKHOUSE = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const SPARK_SUSDC = "0x3128a0F7f0ea68E7B7c9B00AFa7E41045828e858";
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

/**
 * The user whose deposit this is: shares and any refund go here. It is an example address nobody
 * holds a key to; everything above is derived from it, so pointing it at an address you control
 * updates every address on the page.
 */
export const YOU = "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086";

export const AMOUNT = 1_000_000_000n; // 1,000 USDC, six decimals.
export const EXPIRY = 1_800_000_000n; // 15 Jan 2027, 08:00 UTC.
export const CHAIN_ID = 8453n; // Base.

export type Entity = { name: string; logo?: string };

/** Who the addresses in the terms belong to. */
const KNOWN: Record<string, Entity> = {
  [USDC.toLowerCase()]: { name: "USDC", logo: "usdc" },
  [STEAKHOUSE.toLowerCase()]: { name: "Steakhouse Prime USDC", logo: "/protocols/morpho.png" },
  [SPARK_SUSDC.toLowerCase()]: { name: "Spark Savings USDC", logo: "/protocols/spark.png" },
  [AAVE_POOL.toLowerCase()]: { name: "Aave V3 Pool", logo: "/protocols/aave.svg" },
  [YOU.toLowerCase()]: { name: "You", logo: "you" },
};

export const identify = (address: string): Entity | undefined => KNOWN[address.toLowerCase()];

export const CHAINS: Record<string, string> = { "8453": "Base", "42161": "Arbitrum", "143": "Monad", "5042": "Arc" };

type ArgType = "address" | "uint256" | "uint16";
type Fn = { name: string; selector: string; args: { name: string; type: ArgType }[] };

export const FUNCTIONS: Record<string, Fn> = {
  "095ea7b3": {
    name: "approve",
    selector: "095ea7b3",
    args: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  "6e553f65": {
    name: "deposit",
    selector: "6e553f65",
    args: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
  },
  "617ba037": {
    name: "supply",
    selector: "617ba037",
    args: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
  },
};

type CallSpec = { target: string; fn: string; args: (string | bigint)[] };

type Spec = {
  id: SessionId;
  protocol: string;
  logo: string;
  /** The vault or market, as its tab names it. */
  vault: string;
  salt: string;
  calls: CallSpec[];
};

export type SessionId = "morpho" | "spark" | "aave";

const approve = (spender: string): CallSpec => ({ target: USDC, fn: "095ea7b3", args: [spender, AMOUNT] });

const SPECS: Spec[] = [
  {
    id: "morpho",
    protocol: "Morpho",
    logo: "/protocols/morpho.png",
    vault: "Steakhouse Prime USDC",
    salt: "0x4b7ef6dd50ef7570851a0abfbf121fa35edfcdd5f83d07e6bc275547447ec004",
    calls: [approve(STEAKHOUSE), { target: STEAKHOUSE, fn: "6e553f65", args: [AMOUNT, YOU] }],
  },
  {
    id: "spark",
    protocol: "Spark",
    logo: "/protocols/spark.png",
    vault: "Savings USDC",
    salt: "0x5d3f6d1bd1c35aa177ab37a29ab3b9dc26382b1d3982226b54f60dc58d2d1ff5",
    calls: [approve(SPARK_SUSDC), { target: SPARK_SUSDC, fn: "6e553f65", args: [AMOUNT, YOU] }],
  },
  {
    id: "aave",
    protocol: "Aave",
    logo: "/protocols/aave.svg",
    vault: "V3 USDC market",
    salt: "0x0f98c6e3ddb4a79d87938aa4e11e733a26256f0d8ee045d264e65e607c6391c5",
    calls: [approve(AAVE_POOL), { target: AAVE_POOL, fn: "617ba037", args: [USDC, AMOUNT, YOU, 0n] }],
  },
];

// ---- Encoding, with a map of which bytes mean what -------------------------------------------------

/** Where a call's parts sit in the terms, and what the app said they would be. */
export type CallLayout = {
  target: number;
  selector: number;
  args: { name: string; type: ArgType; at: number; expect: string | bigint }[];
  expect: { target: string; selector: string };
};

export type Session = Omit<Spec, "salt" | "calls"> & {
  terms: Uint8Array;
  marks: Mark[];
  calls: CallLayout[];
  /** Where the fixed-size parameters sit. */
  at: Record<"token" | "amount" | "expiration" | "recovery" | "salt" | "chainId", number>;
  /** What the app shows: the address derived from the terms as issued. */
  address: string;
};

function build(spec: Spec): Session {
  const parts: Uint8Array[] = [];
  const marks: Mark[] = [];
  let size = 0;
  const put = (b: Uint8Array, field: Mark["field"], kind: Mark["kind"] = "value") => {
    parts.push(b);
    marks.push({ field, kind, from: size, to: size + b.length });
    size += b.length;
    return size - b.length;
  };

  // The head: seven words, the calls by reference.
  const at = {
    token: put(addressWord(USDC), "token") + 12,
    amount: put(word(AMOUNT), "amount"),
    expiration: 0,
    recovery: 0,
    salt: 0,
    chainId: 0,
  };
  put(word(7n * 32n), "calls", "meta");
  at.expiration = put(word(EXPIRY), "expiration");
  at.recovery = put(addressWord(YOU), "recovery") + 12;
  at.salt = put(fromHex(spec.salt), "salt");
  at.chainId = put(word(CHAIN_ID), "chainId");

  // The calls: a length, an offset to each call, then each call's target and calldata.
  const data = spec.calls.map((c) => 4 + 32 * c.args.length);
  put(word(BigInt(spec.calls.length)), "calls", "meta");
  let offset = spec.calls.length * 32;
  for (const n of data) {
    put(word(BigInt(offset)), "calls", "meta");
    offset += 96 + Math.ceil(n / 32) * 32;
  }
  const calls = spec.calls.map((c, i): CallLayout => {
    const field: FieldName = `calls.${i}`;
    const fn = FUNCTIONS[c.fn];
    const target = put(addressWord(c.target), field) + 12;
    put(word(0x40n), field, "meta");
    put(word(BigInt(data[i])), field, "meta");
    const selector = put(fromHex(c.fn), field, "selector");
    const args = c.args.map((v, k) => {
      const type = fn.args[k].type;
      const start = put(type === "address" ? addressWord(v as string) : word(v as bigint), field);
      return { name: fn.args[k].name, type, at: type === "address" ? start + 12 : start, expect: v };
    });
    const pad = (32 - (data[i] % 32)) % 32;
    if (pad) put(new Uint8Array(pad), field, "meta");
    return { target, selector, args, expect: { target: c.target, selector: c.fn } };
  });

  const terms = concat(...parts);
  const { id, protocol, logo, vault } = spec;
  return { id, protocol, logo, vault, terms, marks, calls, at, address: derive(terms) };
}

export const SESSIONS: Session[] = SPECS.map(build);

// ---- Reading values back, as people read them ---------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A UTC timestamp as "15 Jan 2027, 08:00 UTC", the same on the server and in every browser. */
export function formatDate(ts: bigint) {
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return "Not a date";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export const short = (address: string, n = 4) => `${address.slice(0, 2 + n)}…${address.slice(-n)}`;

/** A timestamp's day, "15 Jan 2027", and its time, "08:00 UTC". */
export function formatDay(ts: bigint): [string, string] {
  const full = formatDate(ts);
  const cut = full.lastIndexOf(", ");
  return cut < 0 ? [full, ""] : [full.slice(0, cut), full.slice(cut + 2)];
}
