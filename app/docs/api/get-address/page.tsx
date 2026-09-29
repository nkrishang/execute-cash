import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, Endpoint, Fields, H2 } from "@/components/docs/prose";
import { MORPHO_EXAMPLE } from "@/lib/docs";
import { json, MORPHO_RESPONSE } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Look up an address",
  description: "Get the intent behind an executable address.",
};

export default function GetAddress() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Look up an address">
        <p>Get the intent behind an executable address.</p>
      </DocHead>
      <Endpoint method="GET" path="/address/{address}" auth="Public" />

      <p>
        Wallets and apps call this with an address a user is about to pay, recompute the address from the intent, and show what paying it
        will do.
      </p>

      <H2 id="path">Path</H2>
      <Fields
        fields={[
          {
            name: "address",
            type: "address",
            description: "The executable address: 0x and 40 hex characters, in any case.",
            example: MORPHO_EXAMPLE.address,
          },
        ]}
      />

      <H2 id="response">Response</H2>
      <p>
        The same body <Link href={DOCS.createAddress}>Create an address</Link> returned: <code>address</code>, <code>factory</code>,{" "}
        <code>intent</code> and <code>terms</code>.
      </p>
      <Code lang="json" code={MORPHO_RESPONSE} title="200 OK" />

      <H2 id="trust">Why you can trust it</H2>
      <ul className="doc-list">
        <li>
          <strong>Unforgeable.</strong> A wrong intent derives a different address, so the answer can be checked against the address
          itself. See <Link href={`${DOCS.quickstart}#verify`}>Verify an executable address</Link>.
        </li>
        <li>
          <strong>Immutable.</strong> An address’s intent never changes, so responses carry{" "}
          <code>Cache-Control: public, max-age=31536000, immutable</code>, and can be cached and mirrored.
        </li>
        <li>
          <strong>Public.</strong> Knowing the address is enough. Its intent goes onchain anyway, in the execution’s calldata.
        </li>
      </ul>

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
            <tr>
              <td>404</td>
              <td>
                <code>not_found</code>
              </td>
              <td>Execute has no intent for this address: an ordinary account, or one made with the contracts directly.</td>
            </tr>
            <tr>
              <td>400</td>
              <td>
                <code>invalid_request</code>
              </td>
              <td>The path isn’t an address.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Code lang="json" code={json({ error: { code: "not_found", message: "Execute has no intent for this address", issues: [] } })} title="404 Not Found" />
    </>
  );
}
