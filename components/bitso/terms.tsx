"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { LogoMark, type Logo } from "@/components/debugger-kit";
import { MARKET, sharePriceText, type BitsoTerms } from "@/lib/bitso";
import { formatAmount, formatMinute, short } from "@/lib/execute/format";

/*
 * What sending to the address does, call by call, with the arguments it commits to: the wallet and
 * amount as they're typed, then everything else once the address exists, recomputed in the browser.
 * The argument names are the functions' own, as the calldata carries them.
 */

const MORPHO: Logo = { kind: "img", src: "/protocols/morpho.png" };

export type Proof = { address: string; ok: true } | { address: string; ok: false; reason: string };

function Arg({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="bitso-arg">
      <dt>{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Who({ logo, name, sub, address }: { logo: Logo; name: string; sub?: string; address?: string }) {
  return (
    <span className="bitso-who">
      <LogoMark logo={logo} address={address} />
      <span className="bitso-who-name">{name}</span>
      {sub && <span className="bitso-who-sub">{sub}</span>}
    </span>
  );
}

/** A value the terms don't have yet, saying where it will come from. */
const Later = ({ children }: { children: ReactNode }) => <span className="bitso-later">{children}</span>;

export function Terms({ wallet, units, terms, proof }: { wallet: Address | null; units: bigint | null; terms: BitsoTerms | null; proof: Proof | null }) {
  const usdc = units !== null ? `${formatAmount(units.toString(), 6)} USDC` : null;
  const you = wallet ? <Who logo={{ kind: "you" }} name={short(wallet)} sub="you" address={wallet} /> : <Later>your wallet</Later>;
  const bound = terms ? Number(sharePriceText(terms.maxSharePriceE27)).toFixed(6) : null;
  const lltv = `${Number(MARKET.lltv / 10n ** 14n) / 100}%`;

  return (
    <div className="bitso-terms">
      <div className="dbg-aura" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="dbg-window bitso-window">
        <p className="bitso-window-bar">
          <span>What sending does</span>
          <span className="bitso-window-chain">
            <LogoMark logo={{ kind: "base" }} />
            Base
          </span>
        </p>

        <ol className="bitso-calls">
          <li className="bitso-call">
            <p className="bitso-call-head">
              <span className="bitso-n">01</span>
              <LogoMark logo={{ kind: "usdc" }} />
              <span className="bitso-fn">
                <b>USDC</b>.transfer
              </span>
            </p>
            <p className="bitso-why">Hands the USDC to Morpho’s bundler adapter.</p>
            <dl className="bitso-args">
              <Arg name="to">
                <Who logo={MORPHO} name="GeneralAdapter1" sub="Morpho" />
              </Arg>
              <Arg name="amount">{usdc ?? <Later>what you deposit</Later>}</Arg>
            </dl>
          </li>

          <li className="bitso-call">
            <p className="bitso-call-head">
              <span className="bitso-n">02</span>
              <LogoMark logo={MORPHO} />
              <span className="bitso-fn">
                <b>Bundler3</b>.multicall
              </span>
            </p>
            <p className="bitso-why">Morpho’s bundler runs two steps, in the same transaction.</p>
            <ol className="bitso-inner-calls">
              <li>
                <p className="bitso-fn">erc4626Deposit</p>
                <p className="bitso-why">Deposits exactly the amount. The adapter keeps the shares for the next step.</p>
                <dl className="bitso-args">
                  <Arg name="vault">
                    <Who logo={MORPHO} name="Bitso USDC Prime" />
                  </Arg>
                  <Arg name="assets">{usdc ?? <Later>what you deposit</Later>}</Arg>
                  <Arg name="maxSharePriceE27">{bound ? `${bound} USDC a share` : <Later>quoted when it’s created</Later>}</Arg>
                  <Arg name="receiver">
                    <Who logo={MORPHO} name="GeneralAdapter1" />
                  </Arg>
                </dl>
              </li>
              <li>
                <p className="bitso-fn">morphoSupplyCollateral</p>
                <p className="bitso-why">Posts every share it holds as collateral, credited to your wallet.</p>
                <dl className="bitso-args">
                  <Arg name="marketParams">
                    <Who logo={MORPHO} name="bitusdcp / MXNB" sub={`LLTV ${lltv}`} />
                  </Arg>
                  <Arg name="assets">all of its bitusdcp</Arg>
                  <Arg name="onBehalf">{you}</Arg>
                </dl>
              </li>
            </ol>
          </li>
        </ol>

        <dl className="bitso-args bitso-rest">
          <Arg name="recovery">{you}</Arg>
          <Arg name="expirationTimestamp">{terms ? formatMinute(terms.expirationTimestamp) : <Later>5 minutes after it’s created</Later>}</Arg>
          <Arg name="chainId">
            <Who logo={{ kind: "base" }} name="Base" sub="8453" />
          </Arg>
        </dl>

        <div className="bitso-proof" data-verdict={proof ? (proof.ok ? "ok" : "bad") : undefined}>
          {proof ? (
            <>
              <code className="bitso-proof-address">{proof.address}</code>
              <span className="bitso-proof-verdict" role="status">
                {proof.ok ? "Recomputed from these terms in your browser" : `Doesn’t check out: ${proof.reason}`}
              </span>
            </>
          ) : (
            <span className="bitso-proof-verdict">The address is computed from these terms when it’s created.</span>
          )}
        </div>
      </div>
    </div>
  );
}
