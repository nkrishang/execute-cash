import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, Endpoint, Fields, H2 } from "@/components/docs/prose";
import { CHAINS, FACTORY } from "@/lib/docs";
import { json } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "List chains",
  description: "Get the chains and tokens Execute supports.",
};

const EXAMPLE = json({
  factory: FACTORY,
  chains: CHAINS.filter((c) => c.live).map((c) => ({
    chainId: c.id,
    name: c.name.split(" ")[0].toLowerCase(),
    tokens: c.tokens.map((t) => ({ symbol: t.symbol, address: t.address, decimals: 6 })),
  })),
});

export default function Chains() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="List chains">
        <p>Get the chains and tokens Execute supports.</p>
      </DocHead>
      <Endpoint method="GET" path="/chains" auth="Public" />

      <p>
        An intent’s <code>chainId</code> must be one of these chains, and its <code>token</code> one of that chain’s tokens.
      </p>

      <H2 id="response">Response</H2>
      <Fields
        fields={[
          { name: "factory", type: "address", description: "The PaymentFactory, at the same address on every chain." },
          {
            name: "chains",
            type: "array",
            description: "The chains new addresses can be created on.",
            fields: [
              { name: "chainId", type: "integer", description: "The chain’s id, as intents give it." },
              { name: "name", type: "string", description: "A short name, for display." },
              {
                name: "tokens",
                type: "array",
                description: "The tokens an intent can take on this chain.",
                fields: [
                  { name: "symbol", type: "string", description: "The token’s symbol." },
                  { name: "address", type: "address", description: "The token contract." },
                  { name: "decimals", type: "integer", description: "Its decimals: amounts are in base units of these." },
                ],
              },
            ],
          },
        ]}
      />
      <Code lang="json" code={EXAMPLE} title="200 OK" />
      <p className="doc-small">
        Explorer links for the factory on each chain are in <Link href={DOCS.supportedChains}>Supported chains</Link>.
      </p>
    </>
  );
}
