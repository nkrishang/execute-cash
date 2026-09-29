import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, Fields, H2, Note } from "@/components/docs/prose";
import { MORPHO_EXAMPLE } from "@/lib/docs";
import { json } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Webhooks",
  description: "Get a signed POST every time an address you created changes.",
};

const EVENTS: [string, string][] = [
  ["address.detected", "A payment to the address was seen onchain. It counts once confirmed."],
  ["address.funded", "The address holds the amount, and Execute is executing it."],
  ["address.failing", "A call reverts. Execute retries until expiry; status.message says why."],
  ["address.settled", "Every call ran."],
  ["address.refunding", "Past expiry with a balance, which is on its way to recovery."],
  ["address.refunded", "The balance went to recovery."],
  ["address.expired", "Expired with nothing to return."],
];

const BODY = json({
  id: "01925f3c-7d2e-7b41-9a8c-2f5e8d1b4c60",
  type: "address.settled",
  createdAt: "2026-09-29T07:12:31Z",
  sequence: 7,
  address: MORPHO_EXAMPLE.address,
  chainId: 8453,
  status: { address: MORPHO_EXAMPLE.address, state: "settled", transactionHash: "0x5e0c…", blockNumber: 36120455, updatedAt: "2026-09-29T07:12:31Z" },
  data: {},
});

const VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";

/** Whether a webhook is from Execute: the signature covers "<t>.<body>", and t is recent. */
export function verifyWebhook(rawBody: string, signature: string, secret: string, toleranceSecs = 300): boolean {
  const parts = new Map(signature.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const t = Number(parts.get("t"));
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSecs) return false;
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest();
  const given = Buffer.from(parts.get("v1") ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}`;

export default function Webhooks() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Webhooks">
        <p>Get a signed POST every time an address you created changes.</p>
      </DocHead>

      <H2 id="setup">Setup</H2>
      <p>
        Set your endpoint in the <Link href="/dashboard">dashboard</Link>. It must be a public <code>https</code> URL. Every address your
        account creates, with its API key or its client ID, reports there.
      </p>

      <H2 id="events">Events</H2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Sent when</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(([type, when]) => (
              <tr key={type}>
                <td>
                  <code>{type}</code>
                </td>
                <td>{when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="payload">Payload</H2>
      <Code lang="json" code={BODY} title="POST your endpoint" />
      <Fields
        fields={[
          { name: "id", type: "string · UUID", description: "The event’s id. Deliveries can repeat: skip an id you’ve already handled." },
          { name: "type", type: "string", description: "One of the events above." },
          { name: "createdAt", type: "string · RFC 3339", description: "When the event happened." },
          {
            name: "sequence",
            type: "integer",
            description: "Grows with every change to the address. Deliveries can arrive out of order: keep the one with the highest sequence.",
          },
          { name: "address", type: "address", description: "The executable address." },
          { name: "chainId", type: "integer", description: "Its chain." },
          {
            name: "status",
            type: "object",
            description: (
              <>
                The address’s status as of the event, exactly as <Link href={DOCS.addressStatus}>Get an address’s status</Link> returns it.
              </>
            ),
          },
          { name: "data", type: "object", description: "Details of the event, for diagnostics. They vary by event: rely on status." },
        ]}
      />

      <H2 id="headers">Headers</H2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Header</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>X-Execute-Signature</code>
              </td>
              <td>
                <code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>: see below.
              </td>
            </tr>
            <tr>
              <td>
                <code>X-Execute-Event-Id</code>
              </td>
              <td>
                The event’s <code>id</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>X-Execute-Event-Type</code>
              </td>
              <td>
                The event’s <code>type</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>X-Execute-Delivery-Attempt</code>
              </td>
              <td>1 on the first delivery, then 2, 3…</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H2 id="signatures">Verifying signatures</H2>
      <p>
        <code>v1</code> is the HMAC-SHA256 of <code>&lt;t&gt;.&lt;raw body&gt;</code>, keyed with your signing secret from the dashboard, as
        hex. Check it against the body exactly as received, before parsing it, and reject timestamps more than five minutes old so a
        captured delivery can’t be replayed:
      </p>
      <Code lang="typescript" code={VERIFY} title="verify-webhook.ts" />
      <Note>Rotating the signing secret in the dashboard takes effect at once: deliveries are signed with the new one from then on.</Note>

      <H2 id="retries">Delivery and retries</H2>
      <p>
        Answer with any <code>2xx</code> within 10 seconds. Anything else is retried with exponential backoff, from a second up to an hour
        between attempts, for 24 hours. Handle events idempotently: the same <code>id</code> can arrive more than once.
      </p>
    </>
  );
}
