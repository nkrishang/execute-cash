import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, H2, Note } from "@/components/docs/prose";
import { API_URL } from "@/lib/docs";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Authentication",
  description: "Authenticate with an API key from your servers, or a client ID from your web pages.",
};

const ERRORS: [string, string, string][] = [
  ["401", "unauthorized", "No credential, or one Execute doesn’t know."],
  ["403", "api_key_in_browser", "An API key sent from a browser (the request has an Origin header)."],
  ["403", "origin_required", "A client ID sent without an Origin header, i.e. not from a browser."],
  ["403", "origin_not_allowed", "A client ID sent from an origin the account doesn’t allow."],
  ["400", "invalid_request", "Both credentials in one request."],
  ["429", "rate_limited", "Over the credential’s rate limit."],
];

export default function Authentication() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Authentication">
        <p>Authenticate with an API key from your servers, or a client ID from your web pages.</p>
      </DocHead>

      <H2 id="base-url">Base URL</H2>
      <p>
        Every route lives under <code>{API_URL}</code>. Requests and responses are JSON.
      </p>

      <H2 id="credentials">Credentials</H2>
      <p>
        Creating an address takes one of your account’s two credentials, both from the <Link href="/dashboard">dashboard</Link>. Looking an
        address up, getting its status and listing chains take none.
      </p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Credential</th>
              <th>Header</th>
              <th>Send it from</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>API key</td>
              <td>
                <code>Authorization: Bearer exe_sk_…</code>
              </td>
              <td>Your servers. It’s secret.</td>
            </tr>
            <tr>
              <td>Client ID</td>
              <td>
                <code>X-Client-Id: exe_client_…</code>
              </td>
              <td>Your web pages. It’s publishable.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Send exactly one of them per request.</p>

      <H2 id="api-keys">API keys</H2>
      <p>
        An API key is <code>exe_sk_</code> and 64 hex characters, sent as a bearer token. It works from servers only: a request that carries
        it and an <code>Origin</code> header came from a browser, and is refused with <code>403 api_key_in_browser</code>. A key that has
        been in a browser should be rotated.
      </p>
      <Code
        lang="shell"
        code={`curl ${API_URL}/address/create \\
  -H "Authorization: Bearer $EXECUTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @intent.json`}
      />
      <p>
        The dashboard shows a key once, when it’s created or rotated, and keeps only its first characters. Rotating replaces it at once: the
        old key stops working immediately.
      </p>

      <H2 id="client-ids">Client IDs</H2>
      <p>
        A client ID is <code>exe_client_</code> and 32 hex characters, sent in the <code>X-Client-Id</code> header. It works only from the
        origins your account allows. Browsers state the origin themselves, in the <code>Origin</code> header, and scripts can’t change it,
        so a client ID copied from your page doesn’t work from anyone else’s.
      </p>
      <Code
        lang="typescript"
        code={`const res = await fetch("${API_URL}/address/create", {
  method: "POST",
  headers: { "X-Client-Id": "exe_client_…", "Content-Type": "application/json" },
  body: JSON.stringify(intent),
});`}
      />
      <p>Add allowed origins in the dashboard, as they appear in the browser’s address bar, without a path:</p>
      <ul className="doc-list">
        <li>
          <code>https://app.example.com</code> allows exactly that origin.
        </li>
        <li>
          <code>https://*.example.com</code> allows every subdomain of <code>example.com</code>, but not <code>example.com</code> itself.
        </li>
        <li>
          <code>http</code> works for local development only: <code>http://localhost:3000</code>, <code>http://127.0.0.1:5173</code>.
        </li>
      </ul>
      <p>An account allows up to 20 origins.</p>
      <Note>
        Outside a browser, anyone can send any <code>Origin</code>. That’s acceptable because a client ID can only create addresses, which
        moves no funds, and it has its own, lower rate limit. Rotate it if it’s abused.
      </Note>

      <H2 id="rate-limits">Rate limits</H2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Credential</th>
              <th>Sustained</th>
              <th>Burst</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>API key</td>
              <td>50 requests a second</td>
              <td>100</td>
            </tr>
            <tr>
              <td>Client ID</td>
              <td>10 requests a second</td>
              <td>20</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Over a limit, requests are refused with <code>429 rate_limited</code>. The public routes are answered with CORS <code>*</code>, so
        pages can call them directly.
      </p>

      <H2 id="errors">Errors</H2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Code</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map(([status, code, when]) => (
              <tr key={code + status}>
                <td>{status}</td>
                <td>
                  <code>{code}</code>
                </td>
                <td>{when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="doc-small">
        How errors are shaped is in <Link href={DOCS.errors}>Errors</Link>.
      </p>
    </>
  );
}
