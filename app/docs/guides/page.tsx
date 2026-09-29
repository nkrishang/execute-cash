import type { Metadata } from "next";
import { Cards, DocHead, LinkCard, Mark } from "@/components/docs/prose";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Guides",
  description: "Payments, and earning with Morpho, Spark and Aave, step by step.",
};

export default function Guides() {
  return (
    <>
      <DocHead eyebrow="Guides" title="Guides">
        <p>
          Each guide builds one intent from start to finish: the contracts it calls, why it calls them, and every argument it passes.
        </p>
      </DocHead>
      <Cards>
        <LinkCard href={DOCS.payments} title="Stablecoin payments" icon={<Mark of="usdc" />}>
          Accept USDC from any wallet or exchange, straight into your treasury.
        </LinkCard>
        <LinkCard href={DOCS.morpho} title="Earn with Morpho" icon={<Mark of="morpho" />}>
          Deposit your users’ USDC into a Morpho vault.
        </LinkCard>
        <LinkCard href={DOCS.spark} title="Earn with Spark" icon={<Mark of="spark" />}>
          Earn the Sky Savings Rate with Spark Savings USDC.
        </LinkCard>
        <LinkCard href={DOCS.aave} title="Earn with Aave" icon={<Mark of="aave" />}>
          Supply your users’ USDC to Aave’s lending market.
        </LinkCard>
      </Cards>
    </>
  );
}
