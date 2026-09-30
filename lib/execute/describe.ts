import { VAULT, readBitsoIntent } from "@/lib/bitso";
import { readSwitchIntent, type Vault } from "@/lib/switch";
import { functionItem } from "./derive";
import { chainName, formatAmount, short, tokenOf } from "./format";
import { knownContract, type Known, type Theme } from "./known";
import type { Chain, ChainToken, ExecutableAddress } from "./types";

/** What an executable address does, in a sentence: "Send 1,000.00 USDC. It deposits into Morpho." */
export type Story = {
  /** The token, as the API lists it; null if it doesn't (the amount is then in base units). */
  token: ChainToken | null;
  amount: string;
  symbol: string;
  decimals: number | null;
  chain: string;
  /** What the address does to `object`: "deposits into". */
  verb: string;
  object: string;
  /** Who the main call is to, when we know them. */
  main: Known | null;
  theme: Theme | undefined;
  /** Each call's function name, in order. */
  functions: string[];
};

/** Calls that only set up the main one. */
const SETUP = new Set(["approve", "increaseAllowance", "permit"]);

/** How a call reads, by its function name. The first match wins. */
const VERBS: [RegExp, string][] = [
  [/^depositForBurn/, "bridges through"],
  [/^(deposit|supply|mint)/, "deposits into"],
  [/^stake/, "stakes into"],
  [/^(withdraw|redeem)/, "withdraws from"],
  [/^repay/, "repays"],
  [/^(swap|exactInput|exactOutput)/, "swaps on"],
];

/** A vault as a switch names it: from /morpho's catalog, where the page has it. */
export type NamedVault = Pick<Vault, "chainId" | "address" | "name" | "symbol" | "image">;

export function describe(exe: ExecutableAddress, chains: Chain[], vaults: NamedVault[] = []): Story {
  const { intent } = exe;
  const token = tokenOf(chains, intent.chainId, intent.token);
  const functions = intent.calls.map((c) => functionItem(c.function).name);
  const money = {
    token,
    amount: token ? formatAmount(intent.amount, token.decimals) : intent.amount,
    symbol: token?.symbol ?? short(intent.token),
    decimals: token?.decimals ?? null,
    chain: chainName(intent.chainId),
  };

  // /bitso's addresses run through Morpho's bundler, whose multicall says nothing; say what it does.
  if (readBitsoIntent(intent)) {
    const vault = knownContract(chains, intent.chainId, VAULT);
    return { ...money, verb: "deposits into", object: "Bitso USDC Prime, as collateral for MXNB", main: vault, theme: vault?.protocol?.theme, functions };
  }

  // /morpho's switches pay the source vault's shares to a Morpho bundler; say where they end up.
  const switched = readSwitchIntent(intent);
  if (switched) {
    const vault = (address: string) => vaults.find((v) => v.chainId === intent.chainId && v.address.toLowerCase() === address.toLowerCase());
    const [from, to] = [vault(switched.from), vault(switched.to)];
    const name = to?.name ?? knownContract(chains, intent.chainId, switched.to)?.name ?? short(switched.to);
    const main: Known = { name, logo: { kind: "img", src: to?.image ?? "/protocols/morpho.png" }, protocol: { name: "Morpho", theme: "morpho" } };
    return { ...money, symbol: from?.symbol ?? money.symbol, verb: "switches into", object: name, main, theme: "morpho", functions };
  }

  const index = functions.findLastIndex((f) => !SETUP.has(f));
  const i = index < 0 ? functions.length - 1 : index;
  const call = intent.calls[i];
  const item = functionItem(call.function);
  const main = knownContract(chains, intent.chainId, call.target);
  const named = (address: string) => knownContract(chains, intent.chainId, address)?.name ?? short(address);

  let verb = `calls ${item.name} on`;
  let object = main?.protocol?.name ?? main?.name ?? short(call.target);
  if (item.name === "transfer") {
    // A plain payment: the target is the token, so what matters is who receives it.
    const to = item.inputs.findIndex((p) => p.type === "address");
    verb = "pays";
    object = to >= 0 ? named(call.args[to] as string) : object;
  } else {
    verb = VERBS.find(([re]) => re.test(item.name))?.[1] ?? verb;
  }

  return {
    ...money,
    verb,
    object,
    main,
    theme: main?.protocol?.theme,
    functions,
  };
}
