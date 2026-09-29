import { bytesToHex, hexToBytes, type AbiParameter, type Address } from "viem";
import type { FieldName, Mark } from "@/components/debugger-view";
import { deriveTerms, functionItem, termsOf } from "@/lib/execute/derive";
import type { ArgJson, ExecutableAddress } from "@/lib/execute/types";

/*
 * An executable address laid out for the debugger: its terms, encoded again here in the browser from
 * the intent the API served, with a map of which bytes carry which field. The landing page's debugger
 * knows its three deposits by heart; this one walks the ABI layout of any intent, however many calls
 * it makes and whatever they call.
 *
 *   head   token · amount · calls offset · expirationTimestamp · recovery · salt · chainId
 *   calls  length · one offset per call · then each call: target · data offset · data length ·
 *          data (selector, arguments, padding)
 */

/** An argument the debugger reads back out of the bytes: where its value sits, and what the intent said. */
export type ArgRef = { at: number; type: "address" | "uint"; expect: string };

export type CallLayout = {
  /** Where the target address sits. */
  target: number;
  expectTarget: string;
  /** Where the 4-byte selector sits, and what it should be. */
  selector: number;
  expectSelector: string;
  /** The function's name, as the intent's signature says. */
  name: string;
  /** The argument that moves the amount, when one carries exactly the intent's amount. */
  amount: ArgRef | null;
  /** Whom the call is for: the receiver, spender, recipient… when the signature says. */
  to: ArgRef | null;
};

export type Session = {
  address: Address;
  factory: Address;
  terms: Uint8Array;
  marks: Mark[];
  /** Where each fixed field's value starts (addresses: their 20 bytes). */
  at: { token: number; amount: number; expiration: number; recovery: number; salt: number; chainId: number };
  calls: CallLayout[];
};

const word = (b: Uint8Array, at: number) => BigInt(bytesToHex(b.subarray(at, at + 32)));

function isDynamic(p: AbiParameter): boolean {
  if (p.type === "bytes" || p.type === "string" || /\[\]$/.test(p.type)) return true;
  const fixed = /^(.*)\[(\d+)\]$/.exec(p.type);
  if (fixed) return isDynamic({ ...p, type: fixed[1] });
  if (p.type === "tuple") return (p as { components: readonly AbiParameter[] }).components.some(isDynamic);
  return false;
}

/** Bytes a parameter takes in the head of its encoding: 32 for anything dynamic (an offset). */
function headSize(p: AbiParameter): number {
  if (isDynamic(p)) return 32;
  const fixed = /^(.*)\[(\d+)\]$/.exec(p.type);
  if (fixed) return Number(fixed[2]) * headSize({ ...p, type: fixed[1] });
  if (p.type === "tuple") return (p as { components: readonly AbiParameter[] }).components.reduce((n, c) => n + headSize(c), 0);
  return 32;
}

/** Names that say whom a call is for, most telling first. */
const TO_NAMES = ["receiver", "onBehalfOf", "recipient", "to", "beneficiary", "spender"];

export function buildSession(exe: ExecutableAddress): Session {
  const { intent } = exe;
  const terms = hexToBytes(termsOf(intent));
  const marks: Mark[] = [];
  const put = (field: FieldName, kind: Mark["kind"], from: number, to: number) => {
    if (to > from) marks.push({ field, kind, from, to });
  };

  put("token", "value", 0, 32);
  put("amount", "value", 32, 64);
  put("calls", "meta", 64, 96);
  put("expiration", "value", 96, 128);
  put("recovery", "value", 128, 160);
  put("salt", "value", 160, 192);
  put("chainId", "value", 192, 224);

  const array = Number(word(terms, 64));
  const n = Number(word(terms, array));
  put("calls", "meta", array, array + 32 + 32 * n);

  const calls: CallLayout[] = intent.calls.map((call, i) => {
    const field: FieldName = `calls.${i}`;
    const element = array + 32 + Number(word(terms, array + 32 + 32 * i));
    const data = element + Number(word(terms, element + 32));
    const length = Number(word(terms, data));
    const padded = Math.ceil(length / 32) * 32;
    put(field, "value", element, element + 32);
    put(field, "meta", element + 32, element + 64);
    put(field, "meta", data, data + 32);
    put(field, "selector", data + 32, data + 36);
    put(field, "value", data + 36, data + 32 + length);
    put(field, "meta", data + 32 + length, data + 32 + padded);

    const item = functionItem(call.function);
    let head = data + 36;
    const refs = item.inputs.map((p, k) => {
      const at = head;
      head += headSize(p);
      const value = call.args[k] as ArgJson;
      if (p.type === "address") return { name: p.name ?? "", ref: { at: at + 12, type: "address" as const, expect: value as string } };
      if (/^uint\d*$/.test(p.type)) return { name: p.name ?? "", ref: { at, type: "uint" as const, expect: value as string } };
      return null;
    });
    const amount = refs.find((r) => r?.ref.type === "uint" && r.ref.expect === intent.amount)?.ref ?? null;
    const addresses = refs.filter((r): r is NonNullable<typeof r> => r?.ref.type === "address");
    const byName = TO_NAMES.map((name) => addresses.find((r) => r.name === name)).find(Boolean);
    const other = [...addresses].reverse().find((r) => r.ref.expect.toLowerCase() !== intent.token.toLowerCase());
    return {
      target: element + 12,
      expectTarget: call.target,
      selector: data + 32,
      expectSelector: bytesToHex(terms.subarray(data + 32, data + 36)),
      name: item.name,
      amount,
      to: (byName ?? other)?.ref ?? null,
    };
  });

  // Anything the walk did not reach (it should reach every byte) is bookkeeping.
  const covered = new Uint8Array(terms.length);
  for (const m of marks) covered.fill(1, m.from, m.to);
  for (let i = 0; i < terms.length; i++) if (!covered[i]) put("calls", "meta", i, i + 1);

  return {
    address: exe.address as Address,
    factory: exe.factory as Address,
    terms,
    marks,
    at: { token: 12, amount: 32, expiration: 96, recovery: 140, salt: 160, chainId: 192 },
    calls,
  };
}

/** The address `PaymentFactory` derives for these terms: what the browser holds against the one shown. */
export const derive = (factory: Address, terms: Uint8Array): Address => deriveTerms(factory, bytesToHex(terms));
