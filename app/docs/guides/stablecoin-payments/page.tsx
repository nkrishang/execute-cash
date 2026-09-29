import type { Metadata } from "next";
import { GuidePage, type Guide } from "@/components/docs/guide";
import { Mark } from "@/components/docs/prose";
import { BASE_USDC } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Stablecoin payments",
  description: "Accept stablecoin payments in your app with Execute.",
};

const guide: Guide = {
  title: "Stablecoin payments",
  intro: (
    <>
      Accept stablecoin payments in your app with <Mark of="execute" /> Execute.
    </>
  ),
  summary: (
    <>
      Your customer pays an executable address from any wallet or exchange, and the address passes exactly the price on to your treasury.
      You never ask them to connect a wallet, and they sign nothing but a transfer.
    </>
  ),
  settled: <>the price is in your treasury, and the transaction is the payment’s receipt.</>,
  contracts: [{ name: "USDC", address: BASE_USDC, role: "The token your customer pays in, and the contract called to pass it on." }],
  calls: [
    {
      contract: "USDC",
      address: BASE_USDC,
      function: "transfer(address to, uint256 amount)",
      why: (
        <>
          The transfer every ERC-20 has. The executable address calls it as itself, so it moves the payment from its own balance to your
          treasury.
        </>
      ),
      args: [
        { name: "to", value: "$TREASURY", why: "Your treasury: where the payment ends up." },
        { name: "amount", value: "$AMOUNT", why: "The price. It equals the intent’s amount, so the call spends all of it, as every intent must." },
      ],
    },
  ],
  variables: [
    ["AMOUNT", "25000000", "the price in base units: 25 USDC"],
    ["TREASURY", "0x…", "your treasury"],
    ["CUSTOMER", "0x…", "your customer’s address, for refunds"],
  ],
  recovery: {
    variable: "CUSTOMER",
    why: (
      <>
        your customer’s address, so an overpayment or a late payment goes straight back to them. If you don’t know it, use your own address
        and refund by hand.
      </>
    ),
  },
};

export default function StablecoinPayments() {
  return <GuidePage guide={guide} />;
}
