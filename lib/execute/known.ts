import type { Mint } from "@/components/coin-stage";
import type { Logo } from "@/components/debugger-kit";
import type { Chain, ChainToken } from "./types";

/** A protocol's colours on the debugger (see `.dbg-theme` in globals.css). */
export type Theme = "morpho" | "spark" | "aave";

/** Who a contract is, as people know it. */
export type Known = { name: string; logo: Logo; protocol: { name: string; theme: Theme } | null };

/** Contracts we can name, by chain. Tokens come from the API's chain list; protocols are listed here. */
const PROTOCOLS: Record<number, Record<string, Known>> = {
  8453: {
    "0xbeef0e0834849acc03f0089f01f4f1eeb06873c9": {
      name: "Steakhouse Prime USDC",
      logo: { kind: "img", src: "/protocols/morpho.png" },
      protocol: { name: "Morpho", theme: "morpho" },
    },
    "0x3128a0f7f0ea68e7b7c9b00afa7e41045828e858": {
      name: "Spark Savings USDC",
      logo: { kind: "img", src: "/protocols/spark.png" },
      protocol: { name: "Spark", theme: "spark" },
    },
    "0xa238dd80c259a72e81d7e4664a9801593f98d1c5": {
      name: "Aave V3 Pool",
      logo: { kind: "img", src: "/protocols/aave.svg" },
      protocol: { name: "Aave", theme: "aave" },
    },
  },
};

/** Tokens other than USDC, as their initial on their colour. */
export const TOKEN_COLORS: Record<string, string> = { USDT: "#26a17b", AUSD: "#18181b" };

export function tokenLogo(symbol: string): Logo {
  return symbol === "USDC" ? { kind: "usdc" } : { kind: "letter", letter: symbol[0] ?? "?", color: TOKEN_COLORS[symbol] ?? "#3f3f46" };
}

/** The debugger's coin for a token: USDC's own (null), or its initial on its colour; a question mark when it isn't listed. */
export function mintOf(token: ChainToken | null): Mint | null {
  if (!token) return { letter: "?", color: "#3f3f46" };
  return token.symbol === "USDC" ? null : { letter: token.symbol[0] ?? "?", color: TOKEN_COLORS[token.symbol] ?? "#3f3f46" };
}

export function knownContract(chains: Chain[], chainId: number, address: string): Known | null {
  const a = address.toLowerCase();
  const protocol = PROTOCOLS[chainId]?.[a];
  if (protocol) return protocol;
  const token = chains.find((c) => c.chainId === chainId)?.tokens.find((t) => t.address.toLowerCase() === a);
  return token ? { name: token.symbol, logo: tokenLogo(token.symbol), protocol: null } : null;
}

const CHAIN_MARKS: Record<number, Logo> = {
  8453: { kind: "base" },
  42161: { kind: "letter", letter: "A", color: "#213147" },
  143: { kind: "letter", letter: "M", color: "#6e54ff" },
  5042: { kind: "letter", letter: "A", color: "#18181b" },
  31337: { kind: "letter", letter: "L", color: "#52525b" },
};

export const chainLogo = (chainId: number): Logo => CHAIN_MARKS[chainId] ?? { kind: "unknown" };
