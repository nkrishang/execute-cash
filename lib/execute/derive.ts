import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  isAddressEqual,
  parseAbiItem,
  zeroHash,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from "viem";
import { PAYMENT_CREATION_CODE } from "@/components/payment-creation-code";
import type { ArgJson, CallJson, ExecutableAddress, IntentJson } from "./types";

/**
 * Checks an executable address against its intent, in the browser: the lookup service can withhold
 * an intent but cannot misstate one, because a wrong intent does not derive the address.
 *
 *   data     = selector(function) ++ abi.encode(args)            for each call
 *   terms    = abi.encode(token, amount, calls, expirationTimestamp, recovery, salt, chainId)
 *   initCode = Payment.creationCode ++ abi.encode(CREATE(factory, nonce 1), terms)
 *   address  = CREATE2(factory, bytes32(0), keccak256(initCode))
 */

/**
 * Factories whose `Payment` creation code is the generation bundled here. Only these are trusted: a
 * factory's nonce-1 implementation serves every address's `recover`.
 */
export const KNOWN_FACTORIES: Address[] = [
  "0x6D85B9706D8f076cB8A9fEA37d70Fcb8D22C2952", // Monad, Base, Arbitrum, Arc
  "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Anvil (gum-contracts LocalBootstrap)
];

const CREATION_CODE: Hex = `0x${PAYMENT_CREATION_CODE}`;

/** A call's function as a viem ABI item. */
export function functionItem(signature: string): AbiFunction {
  return parseAbiItem(`function ${signature}`) as AbiFunction;
}

/** An argument's JSON form as viem wants it: integers as bigint, everything else as it is. */
export function toValue(param: AbiParameter, value: ArgJson): unknown {
  const array = /^(.*)\[(\d*)\]$/.exec(param.type);
  if (array) return (value as ArgJson[]).map((v) => toValue({ ...param, type: array[1] }, v));
  if (param.type === "tuple") {
    const components = (param as { components: readonly AbiParameter[] }).components;
    return (value as ArgJson[]).map((v, i) => toValue(components[i], v));
  }
  if (/^u?int\d*$/.test(param.type)) return BigInt(value as string);
  return value;
}

export function encodeCall(call: CallJson): Hex {
  const item = functionItem(call.function);
  const args = item.inputs.map((p, i) => toValue(p, call.args[i]));
  return encodeFunctionData({ abi: [item], args });
}

const TERMS = [
  { type: "address" },
  { type: "uint256" },
  { type: "tuple[]", components: [{ type: "address", name: "target" }, { type: "bytes", name: "data" }] },
  { type: "uint64" },
  { type: "address" },
  { type: "bytes32" },
  { type: "uint256" },
] as const;

export function termsOf(intent: IntentJson): Hex {
  const calls = intent.calls.map((c) => ({ target: getAddress(c.target), data: encodeCall(c) }));
  return encodeAbiParameters(TERMS, [
    getAddress(intent.token),
    BigInt(intent.amount),
    calls,
    BigInt(intent.expirationTimestamp),
    getAddress(intent.recovery),
    intent.salt as Hex,
    BigInt(intent.chainId),
  ]);
}

/** The address `PaymentFactory` gives these terms. */
export function deriveTerms(factory: Address, terms: Hex): Address {
  const implementation = getContractAddress({ from: factory, nonce: 1n });
  const initCode = concat([CREATION_CODE, encodeAbiParameters([{ type: "address" }, { type: "bytes" }], [implementation, terms])]);
  return getContractAddress({ opcode: "CREATE2", from: factory, salt: zeroHash, bytecode: initCode });
}

export const deriveAddress = (factory: Address, intent: IntentJson): Address => deriveTerms(factory, termsOf(intent));

export type Verification =
  | { ok: true; derived: Address }
  | { ok: false; reason: string; derived: Address | null };

export function verify(exe: ExecutableAddress): Verification {
  const factory = getAddress(exe.factory);
  if (!KNOWN_FACTORIES.some((f) => isAddressEqual(f, factory))) {
    return { ok: false, reason: `unknown factory ${factory}`, derived: null };
  }
  let derived: Address;
  try {
    derived = deriveAddress(factory, exe.intent);
  } catch (error) {
    return { ok: false, reason: `the intent could not be encoded: ${error instanceof Error ? error.message : String(error)}`, derived: null };
  }
  if (!isAddressEqual(derived, exe.address as Address)) {
    return { ok: false, reason: `the intent derives ${derived}, not ${exe.address}`, derived };
  }
  return { ok: true, derived };
}
