import "server-only";

/** Base URL of execute-server, without `/v1`. Never sent to the browser: pages and the proxy use it server-side. */
export const executeApiUrl = (process.env.EXECUTE_API_URL ?? "https://api.execute.cash").replace(/\/+$/, "");

/**
 * An API key of Execute's own demo account, for the docs' live demo (app/api/demo). Without it the
 * demo says it isn't set up here, and nothing else changes.
 */
export const demoApiKey = process.env.EXECUTE_DEMO_API_KEY ?? "";

const urls = (paid: string | undefined, ...open: string[]) => (paid ? [paid, ...open] : open);

/**
 * JSON-RPC endpoints for /bitso's and /morpho's quotes and positions, in the order they're tried:
 * Execute's paid one where it's set (production), then the chain's public ones, which are rate limited.
 */
export const rpcUrls = {
  base: urls(process.env.BASE_RPC_URL, "https://mainnet.base.org", "https://base-rpc.publicnode.com"),
  monad: urls(process.env.MONAD_RPC_URL, "https://rpc.monad.xyz", "https://rpc1.monad.xyz"),
  arc: urls(process.env.ARC_RPC_URL, "https://rpc.mainnet.arc.io", "https://arc-rpc.publicnode.com"),
};
