/*
 * The API's input rules, checked in the browser so a mistake shows as it's made and says what to
 * write instead. They accept exactly what execute-server accepts (src/auth/origin.rs and
 * src/webhooks/target.rs); the server still checks everything, and its answer is shown the same way.
 */

export type Check = { ok: true; value: string } | { ok: false; message: string; fix?: string };

/** The most origins an account may allow: execute-server's `credentials.max_allowed_origins`. */
export const MAX_ORIGINS = 20;

const ORIGIN_EXAMPLE = "https://app.example.com";
const NOT_AN_ORIGIN = `That isn’t an origin. An origin looks like ${ORIGIN_EXAMPLE}`;

/**
 * Development builds leave http and private webhook hosts to the server, whose local profile
 * allows them; the deployed dashboard holds to production's rules.
 */
const INSECURE_TARGETS_OK = process.env.NODE_ENV !== "production";

/**
 * A host as the server's URL parser takes it: a domain's labels, an IPv4 address, or a bracketed
 * IPv6 one. Browsers are laxer (Chrome keeps a space in a host, as %20), so this is checked too.
 */
const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?)$/;

const isLocal = (host: string) => host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";
const isIp = (host: string) => host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);

// ---- Allowed origins ---------------------------------------------------------------------------------

/** Splits `scheme://[*.]host[:port]...` and parses it the way the server does, or null if it can't be. */
function parseOrigin(entry: string): { url: URL; wildcard: boolean; hostPort: string } | null {
  const cut = entry.indexOf("://");
  if (cut < 0) return null;
  const rest = entry.slice(cut + 3);
  const wildcard = rest.startsWith("*.");
  const hostPort = wildcard ? rest.slice(2) : rest;
  try {
    return { url: new URL(`${entry.slice(0, cut)}://${hostPort}`), wildcard, hostPort };
  } catch {
    return null;
  }
}

/** Why an entry isn't an allowed origin in canonical form, `scheme://host[:port]`, or null if it is. */
function originError(entry: string): string | null {
  if (!entry.includes("://")) return `An origin starts with its scheme, like ${ORIGIN_EXAMPLE}`;
  const parsed = parseOrigin(entry);
  if (!parsed) return NOT_AN_ORIGIN;
  const { url, wildcard, hostPort } = parsed;
  if (!HOST.test(url.hostname)) return NOT_AN_ORIGIN;
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Use https";
  if (url.username || url.password) return "An origin has no username or password";
  if (url.search || url.hash) return "An origin has no query or fragment";
  if (url.pathname !== "/" || hostPort.includes("/")) return "An origin has no path";
  const host = url.hostname;
  if (wildcard && isIp(host)) return "A wildcard needs a domain, like https://*.example.com";
  if (wildcard && host.split(".").length < 2) return "A wildcard needs a domain under it, like https://*.example.com";
  if (url.protocol === "http:" && (wildcard || !isLocal(host))) return "Use https. http works for localhost only";
  const canonical = `${url.protocol}//${wildcard ? "*." : ""}${host}${url.port ? `:${url.port}` : ""}`;
  if (canonical === entry) return null;
  if (canonical === entry.toLowerCase()) return "Origins are lowercase";
  if (!url.port && /:\d+$/.test(hostPort)) return "Leave out the default port";
  return "Not in standard form";
}

/** The valid origin nearest to what was typed: its scheme, host and port, without the rest. */
function nearestOrigin(entry: string): string | undefined {
  const given = entry.includes("://");
  const parsed = parseOrigin(given ? entry : `https://${entry}`);
  if (!parsed) return undefined;
  const { url, wildcard } = parsed;
  if (!HOST.test(url.hostname)) return undefined;
  const local = !wildcard && isLocal(url.hostname);
  // http stays http only for local hosts; a bare local host gets http, as development servers use.
  const scheme = local && (url.protocol === "http:" || !given) ? "http:" : "https:";
  // Parsed again under that scheme, so a port that is its default drops out.
  let port: string;
  try {
    port = new URL(`${scheme}//${url.hostname}${url.port ? `:${url.port}` : ""}`).port;
  } catch {
    return undefined;
  }
  const candidate = `${scheme}//${wildcard ? "*." : ""}${url.hostname}${port ? `:${port}` : ""}`;
  return candidate !== entry && originError(candidate) === null ? candidate : undefined;
}

/** An entry for the allowed-origins list, checked against the API's rules and the list so far. */
export function checkOrigin(input: string, existing: readonly string[]): Check {
  const entry = input.trim();
  if (!entry) return { ok: false, message: `Enter an origin, like ${ORIGIN_EXAMPLE}` };
  const error = originError(entry);
  if (error) {
    const fix = nearestOrigin(entry);
    // Without a scheme and nothing like a host either, it isn't an origin at all.
    const message = !entry.includes("://") && !fix ? NOT_AN_ORIGIN : error;
    return { ok: false, message, fix: fix && !existing.includes(fix) ? fix : undefined };
  }
  if (existing.includes(entry)) return { ok: false, message: "Already allowed" };
  if (existing.length >= MAX_ORIGINS) return { ok: false, message: `An account allows at most ${MAX_ORIGINS} origins` };
  return { ok: true, value: entry };
}

// ---- Webhook endpoints -----------------------------------------------------------------------------

function isPublicV4(o: number[]) {
  const [a, b, c] = o;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    o.every((x) => x === 255)
  );
}

/** An IPv6 host as the URL parser writes it (`[fd00::1]`), as its eight 16-bit segments. */
function ipv6(host: string): number[] | null {
  const body = host.slice(1, -1);
  const [head, tail] = body.includes("::") ? body.split("::") : [body, undefined];
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const parts = tail === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  return parts.length === 8 ? parts.map((p) => parseInt(p, 16)) : null;
}

/** Whether a host is on the public internet, by the server's rules. */
function isPublicHost(host: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPublicV4(host.split(".").map(Number));
  if (host.startsWith("[")) {
    const s = ipv6(host);
    if (!s) return false;
    const zeros = (n: number) => s.slice(0, n).every((x) => x === 0);
    if (zeros(8) || (zeros(7) && s[7] === 1)) return false; // unspecified, loopback
    if ((s[0] & 0xfe00) === 0xfc00 || (s[0] & 0xffc0) === 0xfe80) return false; // unique local, link local
    if (zeros(5) && s[5] === 0xffff) return isPublicV4([s[6] >> 8, s[6] & 255, s[7] >> 8, s[7] & 255]); // IPv4-mapped
    return true;
  }
  return !(host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes("."));
}

/** A webhook endpoint, checked against the API's rules. */
export function checkWebhookUrl(input: string): Check {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Enter your endpoint’s URL, like https://api.example.com/hooks/execute" };
  if (raw.length > 2048) return { ok: false, message: "A URL has at most 2048 characters" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A URL without its scheme, most likely.
    const fix = raw.includes("://") ? undefined : `https://${raw}`;
    return { ok: false, message: "That isn’t a URL. It starts with https://", fix: fix && checkWebhookUrl(fix).ok ? fix : undefined };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: "Use https" };
  if (url.username || url.password) return { ok: false, message: "Leave the username and password out of the URL" };
  if (!HOST.test(url.hostname)) return { ok: false, message: "That isn’t a valid URL: check the host" };
  if (INSECURE_TARGETS_OK) return { ok: true, value: raw };
  if (url.protocol === "http:") {
    const fix = `https:${raw.slice(url.protocol.length)}`;
    return { ok: false, message: "Use https", fix: checkWebhookUrl(fix).ok ? fix : undefined };
  }
  if (!isPublicHost(url.hostname)) return { ok: false, message: "Use a public address: Execute can’t reach private networks" };
  return { ok: true, value: raw };
}
