import type { Metadata } from "next";
import { GuidePage, type Guide } from "@/components/docs/guide";
import { Mark } from "@/components/docs/prose";
import { BASE_USDC, SPARK_VAULT } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Earn with Spark",
  description: "Let your users earn the Sky Savings Rate on USDC with Spark, with Execute.",
};

const guide: Guide = {
  title: "Earn with Spark",
  intro: (
    <>
      Let your users earn the Sky Savings Rate on USDC with <Mark of="spark" /> Spark, with <Mark of="execute" /> Execute.
    </>
  ),
  summary: (
    <>
      Your user sends USDC to an executable address, which deposits it into Spark Savings USDC on Base, and the savings shares, sUSDC, go to
      your user’s wallet. They never connect their wallet to your app, and never approve anything.
    </>
  ),
  settled: (
    <>
      your user’s wallet holds sUSDC. It grows in value at the Sky Savings Rate, and redeems for USDC at any time, from any app that supports
      Spark.
    </>
  ),
  contracts: [
    { name: "USDC", address: BASE_USDC, role: "The token your user deposits." },
    {
      name: "Spark Savings USDC",
      address: SPARK_VAULT,
      role: "Spark’s savings vault for USDC (sUSDC): an ERC-4626 vault that earns the Sky Savings Rate.",
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
        { name: "spender", value: SPARK_VAULT, why: "The vault, which takes the USDC in the next call." },
        { name: "amount", value: "$AMOUNT", why: "Exactly the deposit, so nothing is left approved afterwards." },
      ],
    },
    {
      contract: "Spark Savings USDC",
      address: SPARK_VAULT,
      function: "deposit(uint256 assets, address receiver)",
      why: (
        <>
          The ERC-4626 deposit: the vault takes the USDC and mints sUSDC to <code>receiver</code>.
        </>
      ),
      args: [
        { name: "assets", value: "$AMOUNT", why: "All of the USDC." },
        { name: "receiver", value: "$WALLET", why: "Your user’s wallet: the sUSDC is theirs." },
      ],
    },
  ],
  variables: [
    ["AMOUNT", "100000000", "the deposit in base units: 100 USDC"],
    ["WALLET", "0x…", "your user’s wallet"],
  ],
  recovery: { variable: "WALLET", why: <>your user’s wallet, so if the deposit can’t happen, their USDC goes straight back to them.</> },
};

export default function EarnWithSpark() {
  return <GuidePage guide={guide} />;
}
