import type { Metadata } from "next";
import { Pager, Sidebar } from "@/components/docs/sidebar";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: { template: "%s — Execute Docs", default: "Execute Docs" },
  description: "Turn DeFi intents into executable addresses your users pay from any wallet, without connecting it to your app.",
};

/** Every docs page: the site's bar, the pages down the side, the page, and the ones either side of it. */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <Navbar cta="always" />
      <div className="docs">
        <Sidebar />
        <main className="docs-main">
          <article className="doc">{children}</article>
          <Pager />
        </main>
      </div>
    </>
  );
}
