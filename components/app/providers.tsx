"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { privyAppId, privyClientId } from "@/lib/env";

/** True when NEXT_PUBLIC_PRIVY_APP_ID is set; the sign-in page explains the setup otherwise. */
const PrivyConfigured = createContext(false);

/** Privy and the dashboard's query client, for the signed-in part of the site only. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (count, error) => {
              const status = (error as { status?: number })?.status;
              if (status && status >= 400 && status < 500) return false;
              return count < 2;
            },
          },
        },
      }),
  );
  const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return (
    <PrivyConfigured.Provider value={Boolean(privyAppId)}>
      {privyAppId ? (
        <PrivyProvider
          appId={privyAppId}
          clientId={privyClientId || undefined}
          config={{
            loginMethods: ["email"],
            appearance: {
              theme: "light",
              accentColor: "#0b0b0c",
              landingHeader: "Sign-in to continue",
              loginMessage: "Manage API secrets and webhooks.",
            },
            embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
          }}
        >
          {tree}
        </PrivyProvider>
      ) : (
        tree
      )}
    </PrivyConfigured.Provider>
  );
}

/**
 * Session state that is safe to read without Privy configured (it reports signed out). `configured`
 * comes from a build-time variable, so the hook order never changes between renders.
 */
export function useSession() {
  const configured = useContext(PrivyConfigured);
  if (!configured) return { configured: false, ready: true, authenticated: false, email: null } as const;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { ready, authenticated, user } = usePrivy();
  return { configured: true, ready, authenticated, email: user?.email?.address ?? null } as const;
}

/**
 * True once sign-in has been loading for `ms` without becoming ready. Privy fetches its config once
 * and never retries, so an interrupted fetch (a dropped connection, a blocked request, a hot reload
 * in development) would otherwise leave the page waiting forever.
 */
export function useSignInStalled(ms = 8000) {
  const { configured, ready } = useSession();
  const waiting = configured && !ready;
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const t = window.setTimeout(() => setStalled(true), ms);
    return () => window.clearTimeout(t);
  }, [waiting, ms]);
  return stalled;
}
