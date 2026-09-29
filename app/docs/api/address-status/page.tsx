import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, Endpoint, Fields, H2, Note } from "@/components/docs/prose";
import { MORPHO_EXAMPLE } from "@/lib/docs";
import { json } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Get an address’s status",
  description: "Get where an executable address’s money is now.",
};

const A = MORPHO_EXAMPLE.address;
const T = "2026-09-29T07:12:31Z";

const STATES: { state: string; meaning: string; example: Record<string, unknown> }[] = [
  { state: "awaiting_funds", meaning: "Waiting for the amount. balance is what has arrived so far.", example: { state: "awaiting_funds", balance: "0" } },
  { state: "funded", meaning: "It holds the amount, and Execute is executing it.", example: { state: "funded", balance: "1000000000" } },
  {
    state: "failing",
    meaning: "Funded, but a call reverts, e.g. a vault at capacity. Execute retries until expiry, then refunds.",
    example: {
      state: "failing",
      balance: "1000000000",
      message: "settlement call 1 (to 0xbeef0e0834849acc03f0089f01f4f1eeb06873c9) reverted: EnforcedPause()",
      revert: {
        kind: "decoded",
        data: "0x5c0dee5d…",
        selector: "0x5c0dee5d",
        name: "CallFailed",
        signature: "CallFailed(uint256,bytes)",
        args: { index: "1" },
        call: { index: 1, target: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9" },
        reason: { kind: "decoded", data: "0xd93c0665", selector: "0xd93c0665", name: "EnforcedPause", signature: "EnforcedPause()", args: {} },
      },
    },
  },
  { state: "settled", meaning: "Every call ran.", example: { state: "settled", transactionHash: "0x5e0c…", blockNumber: 36120455 } },
  { state: "refunding", meaning: "Past expiry with a balance, which is on its way to recovery.", example: { state: "refunding", balance: "400000000" } },
  { state: "refunded", meaning: "The balance went to recovery.", example: { state: "refunded", transactionHash: "0x91ab…", blockNumber: 36120610, amount: "400000000" } },
  { state: "expired", meaning: "Expired with nothing to return.", example: { state: "expired", balance: "0" } },
];

export default function AddressStatus() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Get an address’s status">
        <p>Get where an executable address’s money is now.</p>
      </DocHead>
      <Endpoint method="GET" path="/address/{address}/status" auth="Public" />

      <H2 id="path">Path</H2>
      <Fields fields={[{ name: "address", type: "address", description: "The executable address.", example: A }]} />

      <H2 id="response">Response</H2>
      <p>
        One of seven states. Each carries its own fields and no others, alongside <code>address</code>, <code>state</code> and{" "}
        <code>updatedAt</code>:
      </p>
      <Code lang="json" code={json({ address: A, state: "settled", transactionHash: "0x5e0c…", blockNumber: 36120455, updatedAt: T })} title="200 OK" />
      <p>A failing address says why, in words and decoded:</p>
      <Code lang="json" code={json({ address: A, ...STATES[2].example, updatedAt: T })} title="200 OK · failing" />
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>State</th>
              <th>What it means</th>
              <th>Its fields</th>
            </tr>
          </thead>
          <tbody>
            {STATES.map((s) => (
              <tr key={s.state}>
                <td>
                  <code>{s.state}</code>
                </td>
                <td>{s.meaning}</td>
                <td>
                  {Object.keys(s.example)
                    .filter((k) => k !== "state")
                    .map((k, i) => (
                      <span key={k}>
                        {i > 0 && ", "}
                        <code>{k}</code>
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="fields">Fields</H2>
      <Fields
        fields={[
          { name: "address", type: "address", description: "The executable address." },
          { name: "state", type: "string", description: "One of the seven states above." },
          { name: "balance", type: "string · base units", description: "What the address holds of its token." },
          { name: "message", type: "string", description: "Why the calls revert, in words." },
          {
            name: "revert",
            type: "object",
            description: (
              <>
                The revert, decoded as far as possible: its <code>kind</code> (<code>decoded</code>, <code>empty</code> or{" "}
                <code>unrecognised</code>), the raw <code>data</code> and <code>selector</code>, and when known the error’s <code>name</code>,{" "}
                <code>signature</code> and <code>args</code>. When a call failed, <code>call</code> says which, and <code>reason</code> is
                that call’s own revert, in the same shape.
              </>
            ),
          },
          { name: "transactionHash", type: "string", description: "The transaction that executed or refunded the address." },
          { name: "blockNumber", type: "integer", description: "The block it was in." },
          { name: "amount", type: "string · base units", description: "What was refunded to recovery." },
          { name: "updatedAt", type: "string · RFC 3339", description: "When the state last changed." },
        ]}
      />

      <H2 id="lifecycle">Lifecycle</H2>
      <p>
        An address starts <code>awaiting_funds</code>. Paid in full, it goes to <code>funded</code> and then <code>settled</code>, usually
        within seconds. If a call reverts it goes to <code>failing</code> and is retried; at expiry, an address with a balance goes to{" "}
        <code>refunding</code> and then <code>refunded</code>, and one without goes to <code>expired</code>. Payments that arrive in the day
        after expiry are refunded too.
      </p>
      <Note>
        Poll every few seconds until <code>settled</code>, <code>refunded</code> or <code>expired</code>, or have{" "}
        <Link href={DOCS.webhooks}>webhooks</Link> tell you.
      </Note>

      <H2 id="errors">Errors</H2>
      <p>
        <code>404 not_found</code> when Execute has no intent for the address, and <code>400 invalid_request</code> when the path isn’t an
        address.
      </p>
    </>
  );
}
