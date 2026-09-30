import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Close } from "@/components/address/close";
import { BaseMark } from "@/components/debugger-kit";
import { Navbar } from "@/components/navbar";
import { SwitchTool } from "@/components/switch/switch";
import { loadCatalog } from "@/lib/switch-server";

const title = "Switch Morpho vaults in one transfer";
const description =
  "Send your Morpho vault shares on Base, Monad or Arc, from any wallet, to an executable address hardcoded to withdraw them and deposit into the vault you pick, in one transaction. No wallet connection, no approvals.";

export const metadata: Metadata = {
  title: `${title} — Execute`,
  description,
  openGraph: { type: "website", siteName: "Execute", title, description, url: "https://execute.cash/morpho" },
  twitter: { card: "summary_large_image", title, description },
};

/** A logo set into a sentence, the size of its letters. */
function Mark({ children, square }: { children: ReactNode; square?: boolean }) {
  return (
    <span className="bitso-mark" data-of={square ? "base" : undefined}>
      {children}
    </span>
  );
}

/**
 * Switch: any Morpho vault position into another vault with the same asset, as one executable
 * address, compared before it's made. Then, for whoever builds apps, the landing page's hero, small.
 */
export default async function MorphoPage() {
  const vaults = await loadCatalog();
  return (
    <>
      <Navbar cta="always" />
      <main className="bitso sw dbg-theme" data-theme="morpho">
        <section className="bitso-top">
          <div className="bitso-inner">
            <header className="bitso-head">
              <h1 className="bitso-flow">
                Switch{" "}
                <span className="bitso-token">
                  <span className="bitso-token-mark">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/protocols/morpho.png" alt="" width={24} height={24} />
                  </span>
                  Morpho
                </span>{" "}
                vaults in <mark>one transfer</mark>.
              </h1>
              <p className="bitso-lede">
                Send your vault shares on{" "}
                <Mark square>
                  <BaseMark />
                </Mark>
                Base,{" "}
                <Mark>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/chains/monad.svg" alt="" />
                </Mark>
                Monad or{" "}
                <Mark>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/chains/arc.svg" alt="" />
                </Mark>
                Arc, from any wallet, to an executable address hardcoded to withdraw them and deposit what they’re worth into the vault you
                pick, all in one transaction. No wallet connection, no approvals.
              </p>
            </header>

            <SwitchTool vaults={vaults} />

            <p className="bitso-fine">
              The vaults are Morpho’s and their curators’, and Execute isn’t affiliated with either. APYs are net of the vaults’ fees and change
              all the time. Arc has no Morpho bundler, so there the address deposits a hundredth of a percent under its quote; what’s left stays
              at the address, and can only ever be sent to the destination address.
            </p>
          </div>
        </section>
        <Close />
      </main>
    </>
  );
}
