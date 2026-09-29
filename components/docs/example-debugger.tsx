"use client";

import { useMemo } from "react";
import { AddressDebugger } from "@/components/address/debugger";
import { buildSession } from "@/components/address/session";
import { describe } from "@/lib/execute/describe";
import type { Chain, ExecutableAddress } from "@/lib/execute/types";
import { BASE_USDC, FACTORY, VAULT_EXAMPLE } from "@/lib/docs";

const CHAINS: Chain[] = [{ chainId: 8453, name: "base", tokens: [{ symbol: "USDC", address: BASE_USDC, decimals: 6 }] }];

/** The address page’s debugger, on How it works’ vault deposit: its terms read and hashed in the browser. */
export function ExampleDebugger() {
  const { exe, session, story } = useMemo(() => {
    const exe: ExecutableAddress = { address: VAULT_EXAMPLE.address, factory: FACTORY, intent: VAULT_EXAMPLE.intent, terms: "" };
    return { exe, session: buildSession(exe), story: describe(exe, CHAINS) };
  }, []);
  return (
    <div className="doc-dbg dbg-theme" data-theme={story.theme}>
      <AddressDebugger exe={exe} session={session} story={story} chains={CHAINS} />
    </div>
  );
}
