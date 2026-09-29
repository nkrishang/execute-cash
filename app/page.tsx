import { FlowButton } from "@/components/flow-button";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Story } from "@/components/story";
import { Verify } from "@/components/verify";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero button={<FlowButton />} />
        <Story />
        <Verify />
      </main>
    </>
  );
}
