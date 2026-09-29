import type { Metadata } from "next";
import { Cards, DocHead, LinkCard, Mark } from "@/components/docs/prose";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = { title: "Welcome" };

export default function Welcome() {
  return (
    <>
      <DocHead eyebrow="Docs" title="Welcome" />

      <p className="doc-intro">
        <Mark of="execute" /> <strong>Execute</strong> is a suite of tools built for apps to let their users access DeFi without connecting a
        wallet.
      </p>

      <p>
        Every app is subject to spoofing, phishing, and sophisticated techniques waiting to take advantage of a user who connects their wallet
        and signs a malicious transaction.
      </p>

      <p>
        With the Execute API, apps translate intents, like <em>deposit 100 <Mark of="usdc" /> USDC into a <Mark of="morpho" /> Morpho vault</em>,
        into an <strong>executable address</strong>.
      </p>

      <p>
        Every executable address is single-use, non-custodial and hardwired to execute one specific intent. A user sends the address the exact
        tokens with a standard ERC-20 transfer, from within their wallet’s sandbox, and their intent is executed.
      </p>

      <Cards>
        <LinkCard
          href={DOCS.authentication}
          title="API reference"
          icon={
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7 6 3 10l4 4M13 6l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        >
          Every route, field and error of the Execute API, and the webhooks it sends.
        </LinkCard>
        <LinkCard
          href={DOCS.guides}
          title="Guides"
          icon={
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 4.5h8.5L16 8v7.5H4z M12 4.5V8h4M7 11h6M7 13.5h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        >
          Stablecoin payments, and earning with Morpho, Spark and Aave, step by step.
        </LinkCard>
      </Cards>
    </>
  );
}
