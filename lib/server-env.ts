import "server-only";

/** Base URL of execute-server, without `/v1`. Never sent to the browser: pages and the proxy use it server-side. */
export const executeApiUrl = (process.env.EXECUTE_API_URL ?? "https://api.execute.cash").replace(/\/+$/, "");

/**
 * An API key of Execute's own demo account, for the docs' live demo (app/api/demo). Without it the
 * demo says it isn't set up here, and nothing else changes.
 */
export const demoApiKey = process.env.EXECUTE_DEMO_API_KEY ?? "";
