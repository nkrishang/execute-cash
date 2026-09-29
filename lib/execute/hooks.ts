"use client";

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDashboardClient, type DashboardClient, type TokenGetter } from "./client";
import type { Account } from "./types";

const keys = { account: ["account"] as const, addresses: ["addresses"] as const };

const ClientContext = createContext<DashboardClient | null>(null);

/** Provides the dashboard's API client, signed with whatever session `getToken` reads (Privy's, in the app). */
export function DashboardClientProvider({ getToken, children }: { getToken: TokenGetter; children: ReactNode }) {
  const client = useMemo(() => createDashboardClient(getToken), [getToken]);
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useDashboard(): DashboardClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useDashboard needs a DashboardClientProvider");
  return client;
}

export function useAccount() {
  const api = useDashboard();
  return useQuery({ queryKey: keys.account, queryFn: api.account });
}

export function useAddresses() {
  const api = useDashboard();
  return useInfiniteQuery({
    queryKey: keys.addresses,
    queryFn: ({ pageParam }) => api.addresses(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000,
  });
}

/** A mutation that returns the updated account. */
export function useAccountMutation<A>(fn: (api: ReturnType<typeof useDashboard>, arg: A) => Promise<Account>) {
  const api = useDashboard();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: A) => fn(api, arg),
    onSuccess: (account) => qc.setQueryData(keys.account, account),
  });
}

/** Creating or rotating the API key: the secret comes back once. */
export function useIssueKey(kind: "create" | "rotate") {
  const api = useDashboard();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => (kind === "create" ? api.createKey() : api.rotateKey()),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.account }),
  });
}
