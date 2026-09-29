import type { Metadata } from "next";
import Link from "next/link";
import { DocHead, H2 } from "@/components/docs/prose";
import { CHAINS, FACTORY, FACTORY_SOURCE } from "@/lib/docs";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Supported chains",
  description: "Execute supports Monad, Arbitrum One, Base and Arc mainnets, with PaymentFactory at the same address on each.",
};

const External = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="doc-ext">
    <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SupportedChains() {
  return (
    <>
      <DocHead eyebrow="Resources" title="Supported chains">
        <p>
          Execute supports Monad, Arbitrum One, Base and Arc mainnets.{" "}
          <a href={FACTORY_SOURCE} target="_blank" rel="noopener noreferrer">
            <code>PaymentFactory</code>
          </a>{" "}
          is deployed at the same address on every one of them, so the same intent gives the same address everywhere its <code>chainId</code>{" "}
          allows.
        </p>
      </DocHead>

      <H2 id="chains">Chains</H2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Chain ID</th>
              <th>PaymentFactory</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {CHAINS.map((c) => (
              <tr key={c.id}>
                <td className="doc-nowrap">{c.name}</td>
                <td>
                  <code>{c.id}</code>
                </td>
                <td>
                  <code title={FACTORY}>
                    {FACTORY.slice(0, 6)}…{FACTORY.slice(-4)}
                  </code>
                </td>
                <td className="doc-nowrap doc-right">
                  <a href={`${c.explorer.url}/address/${FACTORY}`} target="_blank" rel="noopener noreferrer">
                    View on {c.explorer.name}
                    <External />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="doc-small">
        The factory, <code>{FACTORY}</code>, is ownerless and can’t be upgraded, and its code is identical on every chain.
      </p>

      <H2 id="tokens">Tokens</H2>
      <p>
        An intent’s <code>token</code> is one of its chain’s tokens. <Link href={DOCS.chains}>List chains</Link> returns the live list.
      </p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Token</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {CHAINS.flatMap((c) =>
              c.tokens.map((t, i) => (
                <tr key={`${c.id}-${t.symbol}`}>
                  <td className="doc-nowrap">{i === 0 ? c.name : ""}</td>
                  <td>
                    {t.symbol}
                    {!c.live && <span className="doc-soon"> · new addresses opening soon</span>}
                  </td>
                  <td>
                    <a href={`${c.explorer.url}/address/${t.address}`} target="_blank" rel="noopener noreferrer" title={t.address}>
                      <code>
                        {t.address.slice(0, 6)}…{t.address.slice(-4)}
                      </code>
                    </a>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
