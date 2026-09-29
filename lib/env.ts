/** Browser-safe configuration. Server-only values live in lib/server-env.ts. */

/** Privy app for the dashboard's sign-in. Without it, /login explains how to set it up. */
export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

/** The public API, as integrators call it (shown in snippets). The dashboard itself goes through /api/execute. */
export const publicApiUrl = (process.env.NEXT_PUBLIC_EXECUTE_API_URL ?? "https://api.execute.cash").replace(/\/+$/, "");
