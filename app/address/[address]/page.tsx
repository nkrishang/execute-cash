import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Close } from "@/components/address/close";
import { AddressView } from "@/components/address/view";
import { Navbar } from "@/components/navbar";
import { describe } from "@/lib/execute/describe";
import type { ChainList, ExecutableAddress, StatusView } from "@/lib/execute/types";
import { executeApiUrl } from "@/lib/server-env";
import { readSwitchIntent } from "@/lib/switch";
import { loadCatalog } from "@/lib/switch-server";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The address's intent, where its money is, and the chains' tokens; null when Execute didn't create it. */
const load = cache(async (address: string) => {
  const [lookup, status, chains] = await Promise.all([
    fetch(`${executeApiUrl}/v1/address/${address}`, { cache: "no-store" }),
    fetch(`${executeApiUrl}/v1/address/${address}/status`, { cache: "no-store" }),
    fetch(`${executeApiUrl}/v1/chains`, { next: { revalidate: 3600 } }),
  ]);
  if (lookup.status === 404) return null;
  if (!lookup.ok) throw new Error(`the Execute API answered ${lookup.status}`);
  const exe = (await lookup.json()) as ExecutableAddress;
  return {
    exe,
    status: status.ok ? ((await status.json()) as StatusView) : null,
    chains: chains.ok ? ((await chains.json()) as ChainList).chains : [],
    // A switch names its vaults from /morpho's catalog.
    vaults: readSwitchIntent(exe.intent) ? await loadCatalog() : [],
  };
});

export async function generateMetadata({ params }: PageProps<"/address/[address]">): Promise<Metadata> {
  const { address } = await params;
  const data = ADDRESS.test(address) ? await load(address) : null;
  if (!data) return { title: "Execute", robots: { index: false, follow: false } };
  const story = describe(data.exe, data.chains, data.vaults);
  const title = `Send ${story.amount} ${story.symbol}. It ${story.verb} ${story.object}.`;
  const description = `An executable address on ${story.chain}, checked in your browser: what sending to it does, byte by byte.`;
  return {
    title: `${title} — Execute`,
    description,
    openGraph: { title, description },
    robots: { index: false, follow: false },
  };
}

/**
 * An executable address, opened up: where its money is, and the debugger from the landing page
 * pointed at it, recomputing it in the browser from the intent the API serves. Then, for whoever
 * builds apps, the landing page's hero, small.
 */
export default async function AddressPage({ params }: PageProps<"/address/[address]">) {
  const { address } = await params;
  if (!ADDRESS.test(address)) notFound();
  const data = await load(address);
  if (!data) notFound();
  const story = describe(data.exe, data.chains, data.vaults);

  return (
    <>
      <Navbar cta="always" />
      <main className="ad dbg-theme" data-theme={story.theme}>
        <section className="ad-top">
          <div className="ad-inner">
            <AddressView exe={data.exe} story={story} chains={data.chains} initialStatus={data.status} />
          </div>
        </section>
        <Close />
      </main>
    </>
  );
}
