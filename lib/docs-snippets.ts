import { API_URL, FACTORY, MORPHO_EXAMPLE, PAYMENT_EXAMPLE } from "@/lib/docs";

/*
 * The docs' longer code samples. The TypeScript was type-checked (strict) and run against a real
 * address on Base on 2026-09-29: the address verifies, and an intent with one value changed doesn't.
 */

export const json = (value: unknown) => JSON.stringify(value, null, 2);

/** POST /v1/address/create, ready to paste into a shell: a fresh expiry and a random salt every time. */
export const CREATE_CURL = `MERCHANT=0x…   # who gets paid
CUSTOMER=0x…   # who gets back anything that can't be spent

curl ${API_URL}/address/create \\
  -H "Authorization: Bearer $EXECUTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "25000000",
    "calls": [
      {
        "target": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "function": "transfer(address to, uint256 amount)",
        "args": ["'$MERCHANT'", "25000000"]
      }
    ],
    "expirationTimestamp": '$(( $(date +%s) + 300 ))',
    "recovery": "'$CUSTOMER'",
    "salt": "0x'$(openssl rand -hex 32)'",
    "chainId": 8453
  }'`;

export const PAYMENT_RESPONSE = json({
  address: PAYMENT_EXAMPLE.address,
  factory: FACTORY,
  intent: PAYMENT_EXAMPLE.intent,
  terms: "0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913…",
});

export const MORPHO_RESPONSE = json({
  address: MORPHO_EXAMPLE.address,
  factory: FACTORY,
  intent: MORPHO_EXAMPLE.intent,
  terms: "0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913…",
});

export const VERIFY_TS = `import { createPublicClient, encodeFunctionData, http, isAddressEqual, parseAbi, parseAbiItem, type AbiFunction, type AbiParameter, type Address, type Hex } from "viem";
import { arbitrum, base, monad } from "viem/chains";

type Intent = {
  token: Address;
  amount: string;
  calls: { target: Address; function: string; args: unknown[] }[];
  expirationTimestamp: number;
  recovery: Address;
  salt: Hex;
  chainId: number;
};

const FACTORY = "${FACTORY}";
const CHAINS = { [base.id]: base, [arbitrum.id]: arbitrum, [monad.id]: monad };
const factoryAbi = parseAbi([
  "function paymentAddress(address token, uint256 amount, (address target, bytes data)[] calls, uint64 expirationTimestamp, address recovery, bytes32 salt, uint256 chainId) view returns (address)",
]);

/** An argument as viem takes it: the API sends integers as base-10 strings, viem wants bigints. */
function toArg(param: AbiParameter, value: unknown): unknown {
  const array = /^(.*)\\[\\d*\\]$/.exec(param.type);
  if (array) return (value as unknown[]).map((v) => toArg({ ...param, type: array[1] }, v));
  if (param.type === "tuple") {
    const { components } = param as { components: readonly AbiParameter[] };
    return (value as unknown[]).map((v, i) => toArg(components[i], v));
  }
  return /^u?int\\d*$/.test(param.type) ? BigInt(value as string) : value;
}

/** Whether \`address\` is the executable address of \`intent\`, as PaymentFactory itself computes it. */
export async function verify(address: Address, intent: Intent): Promise<boolean> {
  const chain = CHAINS[intent.chainId as keyof typeof CHAINS];
  const client = createPublicClient({ chain, transport: http() });
  const calls = intent.calls.map((call) => {
    const fn = parseAbiItem(\`function \${call.function}\`) as AbiFunction;
    const args = fn.inputs.map((param, i) => toArg(param, call.args[i]));
    return { target: call.target, data: encodeFunctionData({ abi: [fn], args }) };
  });
  const derived = await client.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "paymentAddress",
    args: [intent.token, BigInt(intent.amount), calls, BigInt(intent.expirationTimestamp), intent.recovery, intent.salt, BigInt(intent.chainId)],
  });
  return isAddressEqual(derived, address);
}`;

/** For a coding agent: check an address, then say what paying it does. */
export const AGENT_PROMPT = `Verify an Execute executable address before anyone sends funds to it.

Address: <paste the address here>

1. Fetch its intent: GET ${API_URL}/address/<address>. It returns { address, factory, intent, terms }.
2. Check that factory is ${FACTORY}, Execute's PaymentFactory. Stop if it is anything else.
3. For each call in intent.calls, ABI-encode the calldata from "function" (a Solidity signature with parameter names) and "args" (integers are base-10 strings).
4. On the chain intent.chainId, call paymentAddress(token, amount, calls, expirationTimestamp, recovery, salt, chainId) on that factory, passing calls as (target, data) pairs, and check that it returns exactly the address above.
5. If it does, tell me in plain words what sending exactly intent.amount of intent.token to the address will do: each call, in order, and where the funds and anything minted end up. Note that intent.recovery receives any excess, and everything if the calls haven't run by intent.expirationTimestamp.`;
