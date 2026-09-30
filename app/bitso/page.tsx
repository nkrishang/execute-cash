import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Close } from "@/components/address/close";
import { BitsoTool } from "@/components/bitso/tool";
import { BaseMark, UsdcMark } from "@/components/debugger-kit";
import { Navbar } from "@/components/navbar";
import { MARKET_URL, VAULT_URL } from "@/lib/bitso";
import { loadRates, type Rates } from "@/lib/bitso-server";

const title = "USDC → bitusdcp → MXNB, ready to borrow, in one transfer";
const description =
  "Send USDC on Base to an executable address that deposits it in the USDC-bitusdcp vault, then deposits the bitusdcp into the MXNB-bitusdcp vault as collateral, ready for you to borrow MXNB. No wallet connection, no approvals.";

export const metadata: Metadata = {
  title: `${title} — Execute`,
  description,
  openGraph: { type: "website", siteName: "Execute", title, description, url: "https://execute.cash/bitso" },
  twitter: { card: "summary_large_image", title, description },
};

const percent = (x: number) => `${(x * 100).toFixed(2)}%`;
const mxnb = (units: string) => `${(Number(units) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} MXNB`;

function RateRow({ rates }: { rates: Rates }) {
  return (
    <dl className="bitso-rates">
      <div>
        <dt>Bitso USDC Prime</dt>
        <dd>{percent(rates.vaultApy)} APY</dd>
      </div>
      <div>
        <dt>Borrowing MXNB</dt>
        <dd>{percent(rates.borrowApy)} APY</dd>
      </div>
      <div>
        <dt>MXNB to borrow</dt>
        <dd>{mxnb(rates.mxnbAvailable)}</dd>
      </div>
    </dl>
  );
}

/** A token in the header's flow: its mark, then its symbol, never split across lines. */
function Token({ mark, symbol }: { mark: ReactNode; symbol: string }) {
  return (
    <span className="bitso-token">
      <span className="bitso-token-mark">{mark}</span>
      {symbol}
    </span>
  );
}

const Arrow = () => (
  <svg className="bitso-arrow" viewBox="0 0 24 16">
    <path d="M2 8h19M15 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Bitso's vault and its MXNB market as one executable address: send USDC, and it's deposited and
 * posted as collateral for the sender's wallet in one transaction. Then, for whoever builds apps,
 * the landing page's hero, small.
 */
export default async function BitsoPage() {
  const rates = await loadRates();
  return (
    <>
      <Navbar cta="always" />
      <main className="bitso dbg-theme" data-theme="morpho">
        <section className="bitso-top">
          <div className="bitso-inner">
            <header className="bitso-head">
              <h1 className="bitso-flow">
                <span className="sr-only">USDC to bitusdcp to MXNB, ready to borrow, all in one transfer.</span>
                <span aria-hidden="true">
                  <span className="bitso-flow-line">
                    <Token mark={<UsdcMark />} symbol="USDC" /> <Arrow />{" "}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <Token mark={<img src="/tokens/bitusdcp.svg" alt="" width={24} height={24} />} symbol="bitusdcp" /> <Arrow />{" "}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <Token mark={<img src="/tokens/mxnb.svg" alt="" width={24} height={24} />} symbol="MXNB" /> ready to borrow,
                  </span>{" "}
                  <span className="bitso-flow-line">
                    all in <mark>one transfer</mark>.
                  </span>
                </span>
              </h1>
              <p className="bitso-lede">
                Send{" "}
                <span className="bitso-mark">
                  <UsdcMark />
                </span>
                USDC on{" "}
                <span className="bitso-mark" data-of="base">
                  <BaseMark />
                </span>
                Base to an executable address hardcoded to deposit in the{" "}
                <a href={VAULT_URL} target="_blank" rel="noopener noreferrer">
                  USDC-bitusdcp vault
                </a>
                , and then deposit bitusdcp into the{" "}
                <a href={MARKET_URL} target="_blank" rel="noopener noreferrer">
                  MXNB-bitusdcp vault
                </a>{" "}
                as collateral, ready for you to borrow MXNB.
              </p>
              {rates && <RateRow rates={rates} />}
            </header>

            <BitsoTool />

            <p className="bitso-fine">
              Bitso USDC Prime and its MXNB market are Bitso’s, on Morpho; rates vary, and Execute isn’t affiliated with either. Borrowing
              against the collateral happens on Morpho, from your wallet: no address anyone else creates can take on debt in your name.
            </p>
          </div>
        </section>
        <Close />
      </main>
    </>
  );
}
