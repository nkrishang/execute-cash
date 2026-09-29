import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { MorphButton } from "@/components/morph-button";
import { Navbar } from "@/components/navbar";

// The earlier hero, where the button morphs through eleven eras of UI. Kept out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MorphHome() {
  return (
    <>
      <Navbar />
      <main>
        <Hero button={<MorphButton />} />
      </main>
    </>
  );
}
