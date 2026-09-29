import type { Metadata } from "next";
import { GuidePage, type Guide } from "@/components/docs/guide";
import { Mark } from "@/components/docs/prose";
import { AAVE_POOL, BASE_USDC } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Earn with Aave",
  description: "Let your users earn on USDC in Aave’s lending market, with Execute.",
};

const guide: Guide = {
  title: "Earn with Aave",
  intro: (
    <>
      Let your users earn on USDC in <Mark of="aave" /> Aave’s lending market, with <Mark of="execute" /> Execute.
    </>
  ),
  summary: (
    <>
      Your user sends USDC to an executable address, which supplies it to Aave V3 on Base, and the aTokens that represent it go to your
      user’s wallet. They never connect their wallet to your app, and never approve anything.
    </>
  ),
  settled: (
    <>
      your user’s wallet holds aBasUSDC, Aave’s receipt for USDC supplied on Base. Its balance grows as interest accrues, and it redeems for
      USDC at any time, from any app that supports Aave.
    </>
  ),
  contracts: [
    { name: "USDC", address: BASE_USDC, role: "The token your user supplies." },
    { name: "Aave V3 Pool", address: AAVE_POOL, role: "Aave’s lending pool on Base. Supplying USDC to it mints aBasUSDC." },
  ],
  calls: [
    {
      contract: "USDC",
      address: BASE_USDC,
      function: "approve(address spender, uint256 amount)",
      why: (
        <>
          The pool pulls the USDC with <code>transferFrom</code>, so the address first allows it to take exactly the amount, and no more.
        </>
      ),
      args: [
        { name: "spender", value: AAVE_POOL, why: "The pool, which takes the USDC in the next call." },
        { name: "amount", value: "$AMOUNT", why: "Exactly the deposit, so nothing is left approved afterwards." },
      ],
    },
    {
      contract: "Aave V3 Pool",
      address: AAVE_POOL,
      function: "supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
      why: (
        <>
          Aave’s deposit: the pool takes the USDC and mints aBasUSDC to <code>onBehalfOf</code>.
        </>
      ),
      args: [
        { name: "asset", value: BASE_USDC, why: "The asset supplied: USDC." },
        { name: "amount", value: "$AMOUNT", why: "All of it." },
        { name: "onBehalfOf", value: "$WALLET", why: "Your user’s wallet: the aBasUSDC is theirs." },
        { name: "referralCode", value: "0", why: "Aave’s referral codes are unused: 0." },
      ],
    },
  ],
  variables: [
    ["AMOUNT", "100000000", "the deposit in base units: 100 USDC"],
    ["WALLET", "0x…", "your user’s wallet"],
  ],
  recovery: { variable: "WALLET", why: <>your user’s wallet, so if the supply can’t happen, their USDC goes straight back to them.</> },
};

export default function EarnWithAave() {
  return <GuidePage guide={guide} />;
}
