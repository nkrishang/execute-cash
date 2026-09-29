import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, H2 } from "@/components/docs/prose";
import { json } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Errors",
  description: "How the Execute API says what went wrong, and what it would accept instead.",
};

const CODES: [string, string, string][] = [
  ["400", "invalid_intent", "The intent isn’t valid. issues lists every problem."],
  ["400", "invalid_request", "Anything else malformed: a path that isn’t an address, both credentials at once."],
  ["401", "unauthorized", "No credential, or an unknown one."],
  ["403", "api_key_in_browser", "An API key sent from a browser."],
  ["403", "origin_required", "A client ID sent from outside a browser."],
  ["403", "origin_not_allowed", "A client ID sent from an origin the account doesn’t allow."],
  ["404", "not_found", "Execute has no intent for the address."],
  ["409", "address_conflict", "The same calldata was registered with other function signatures."],
  ["429", "rate_limited", "Over the credential’s rate limit."],
  ["503", "unavailable", "Execute can’t serve the request right now. Retry with backoff."],
  ["500", "internal", "Something failed on Execute’s side. Retry with backoff."],
];

export default function Errors() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Errors">
        <p>How the Execute API says what went wrong, and what it would accept instead.</p>
      </DocHead>

      <H2 id="shape">Shape</H2>
      <p>Every error has the same shape: a stable code, a message for people, and, when the body was the problem, every issue at once.</p>
      <Code
        lang="json"
        code={json({
          error: {
            code: "invalid_intent",
            message: "/chainId: expected a JSON integer such as 8453; received the string \"8453\"",
            issues: [{ path: "/chainId", message: "expected a JSON integer such as 8453; received the string \"8453\"" }],
          },
        })}
        title="400 Bad Request"
      />
      <ul className="doc-list">
        <li>
          <code>code</code> is stable: branch on it.
        </li>
        <li>
          <code>message</code> is for people, and may change.
        </li>
        <li>
          <code>issues</code> holds one entry per problem, each with a <code>path</code> (a JSON Pointer into your body) and a{" "}
          <code>message</code> that says what would be accepted. It’s empty when the body wasn’t the problem.
        </li>
      </ul>

      <H2 id="codes">Codes</H2>
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
            {CODES.map(([status, code, when]) => (
              <tr key={code}>
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
        Every issue <Link href={`${DOCS.createAddress}#errors`}>Create an address</Link> reports is listed with it.
      </p>

      <H2 id="request-ids">Request ids</H2>
      <p>
        Every response carries an <code>X-Request-Id</code> header. Include it when you ask about a request, and it can be found in Execute’s
        logs.
      </p>
    </>
  );
}
