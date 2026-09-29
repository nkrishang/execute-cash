import { NextResponse, type NextRequest } from "next/server";
import { executeApiUrl } from "@/lib/server-env";

/**
 * Same-origin proxy to execute-server for this site's own pages.
 *
 * The dashboard's account routes send no CORS headers, so the browser cannot call them directly;
 * this forwards a strict allowlist, passing the Privy access token through untouched. The API
 * verifies it; nothing here grants access. The browser's Origin is never forwarded (the API refuses
 * secret keys from browsers, and has no reason to see this site's origin). The public status route
 * is here too, so the address page can poll it without knowing the API's URL.
 */

type Rule = { method: string; pattern: RegExp; auth: boolean };

const ALLOWED: Rule[] = [
  { method: "GET", pattern: /^account$/, auth: true },
  { method: "POST", pattern: /^account\/api-key$/, auth: true },
  { method: "POST", pattern: /^account\/api-key\/rotate$/, auth: true },
  { method: "POST", pattern: /^account\/client-id\/rotate$/, auth: true },
  { method: "PUT", pattern: /^account\/allowed-origins$/, auth: true },
  { method: "PUT", pattern: /^account\/webhook-url$/, auth: true },
  { method: "DELETE", pattern: /^account\/webhook-url$/, auth: true },
  { method: "POST", pattern: /^account\/webhook-secret\/rotate$/, auth: true },
  { method: "GET", pattern: /^account\/addresses$/, auth: true },
  { method: "GET", pattern: /^address\/0x[0-9a-fA-F]{40}\/status$/, auth: false },
  { method: "GET", pattern: /^chains$/, auth: false },
];

async function proxy(req: NextRequest, ctx: RouteContext<"/api/execute/[...path]">) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const rule = ALLOWED.find((r) => r.method === req.method && r.pattern.test(joined));
  if (!rule) {
    return NextResponse.json({ error: { code: "not_found", message: "no such route", issues: [] } }, { status: 404 });
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (rule.auth) {
    const auth = req.headers.get("authorization");
    if (!auth) {
      return NextResponse.json({ error: { code: "unauthorized", message: "sign in first", issues: [] } }, { status: 401 });
    }
    headers.authorization = auth;
  }
  const hasBody = req.method === "POST" || req.method === "PUT";
  const body = hasBody ? await req.text() : undefined;
  if (body) headers["content-type"] = "application/json";

  const url = new URL(`${executeApiUrl}/v1/${joined}`);
  url.search = req.nextUrl.search;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: body || undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: {
          code: timeout ? "upstream_timeout" : "upstream_unreachable",
          message: timeout ? "The API did not answer in time." : "Could not reach the API.",
          issues: [],
        },
      },
      { status: 502 },
    );
  }
  const out = new Headers({ "cache-control": "no-store" });
  for (const name of ["content-type", "x-request-id"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
