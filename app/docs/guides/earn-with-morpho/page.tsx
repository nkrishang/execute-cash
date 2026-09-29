import type { Metadata } from "next";
import { GuidePage, type Guide } from "@/components/docs/guide";
import { Mark } from "@/components/docs/prose";
import { BASE_USDC, MORPHO_VAULT } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Earn with Morpho",
  description: "Let your users earn on USDC in a Morpho vault, with Execute.",
};

const guide: Guide = {
  title: "Earn with Morpho",
  intro: (
    <>
      Let your users earn on USDC in a <Mark of="morpho" /> Morpho vault, with <Mark of="execute" /> Execute.
    </>
  ),
  summary: (
    <>
      Your user sends USDC to an executable address, which deposits it into Steakhouse Prime USDC, a Morpho vault on Base, and the vault’s
      shares go to your user’s wallet. They never connect their wallet to your app, and never approve anything.
    </>
  ),
  settled: (
    <>
      your user’s wallet holds Steakhouse Prime USDC shares. They grow in value as the vault earns, and redeem for USDC at any time, from any
      app that supports Morpho.
    </>
  ),
  contracts: [
    { name: "USDC", address: BASE_USDC, role: "The token your user deposits." },
    {
      name: "Steakhouse Prime USDC",
      address: MORPHO_VAULT,
      role: "A Morpho vault curated by Steakhouse Financial: an ERC-4626 vault that lends USDC across Morpho markets.",
    },
  ],
  calls: [
    {
      contract: "USDC",
      address: BASE_USDC,
      function: "approve(address spender, uint256 amount)",
      why: (
        <>
          An ERC-4626 deposit pulls its assets with <code>transferFrom</code>, so the address first allows the vault to take exactly the
          amount, and no more.
        </>
      ),
      args: [
        { name: "spender", value: MORPHO_VAULT, why: "The vault, which takes the USDC in the next call." },
        { name: "amount", value: "$AMOUNT", why: "Exactly the deposit, so nothing is left approved afterwards." },
      ],
    },
    {
      contract: "Steakhouse Prime USDC",
      address: MORPHO_VAULT,
      function: "deposit(uint256 assets, address receiver)",
      why: (
        <>
          The ERC-4626 deposit: the vault takes the USDC and mints its shares to <code>receiver</code>.
        </>
      ),
      args: [
        { name: "assets", value: "$AMOUNT", why: "All of the USDC." },
        { name: "receiver", value: "$WALLET", why: "Your user’s wallet: the shares are theirs." },
      ],
    },
  ],
  variables: [
    ["AMOUNT", "100000000", "the deposit in base units: 100 USDC"],
    ["WALLET", "0x…", "your user’s wallet"],
  ],
  recovery: { variable: "WALLET", why: <>your user’s wallet, so if the deposit can’t happen, their USDC goes straight back to them.</> },
};

export default function EarnWithMorpho() {
  return <GuidePage guide={guide} />;
}
