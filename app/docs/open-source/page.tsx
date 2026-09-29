import type { Metadata } from "next";
import { DocHead, H2 } from "@/components/docs/prose";
import { GITHUB } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Open source",
  description: "The repositories behind Execute, and what each one does.",
};

const REPOS: { name: string; job: string; url: string | null }[] = [
  {
    name: "gum-contracts",
    job: "PaymentFactory and Payment: the contracts every executable address is made of. Ownerless, permissionless and non-upgradeable.",
    url: `${GITHUB}/gum-contracts`,
  },
  {
    name: "gum-indexer",
    job: "Watches executable addresses for incoming stablecoin transfers, and reports each payment once it’s confirmed.",
    url: `${GITHUB}/gum-indexer`,
  },
  {
    name: "gum-engine",
    job: "Sends the transactions that execute addresses: a relayer that signs, broadcasts and tracks each one to its receipt.",
    url: `${GITHUB}/gum-engine`,
  },
  {
    name: "execute-server",
    job: "The Execute API: turns intents into executable addresses, serves them back, and takes each address from payment to execution.",
    url: null,
  },
  {
    name: "execute-cash",
    job: "execute.cash: the site, the dashboard, the address pages and these docs.",
    url: null,
  },
];

export default function OpenSource() {
  return (
    <>
      <DocHead eyebrow="Resources" title="Open source">
        <p>The repositories behind Execute, and what each one does.</p>
      </DocHead>

      <H2 id="repositories">Repositories</H2>
      <ul className="doc-repos">
        {REPOS.map((r) => (
          <li key={r.name} className="doc-repo">
            {r.url ? (
              <a href={r.url} className="doc-repo-name" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M8 .2a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z"
                  />
                </svg>
                {r.name}
              </a>
            ) : (
              <span className="doc-repo-name" data-private="">
                {r.name}
                <span className="doc-soon">not published yet</span>
              </span>
            )}
            <p className="doc-repo-job">{r.job}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
