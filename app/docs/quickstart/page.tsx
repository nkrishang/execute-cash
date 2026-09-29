import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Demo } from "@/components/docs/demo";
import { Code, DocHead, Note, Step, Steps } from "@/components/docs/prose";
import { API_HOST } from "@/lib/docs";
import { AGENT_PROMPT, CREATE_CURL, PAYMENT_RESPONSE, VERIFY_TS } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Create an executable address, verify it, and watch it execute.",
};

const PARAMS: [string, string, string][] = [
  ["token", "address", "The ERC-20 your user sends. One of the chain’s tokens."],
  ["amount", "string", "Exactly what the calls spend, in base units: \"25000000\" is 25 USDC."],
  ["calls", "array", "What the address does once it holds the amount: contracts, functions and arguments, run in order."],
  ["expirationTimestamp", "integer", "Unix seconds, 1 to 5 minutes from now. After it, everything goes to recovery."],
  ["recovery", "address", "Receives anything that can’t be spent: excess, late payments, everything after expiry. Usually your user."],
  ["salt", "string", "32 random bytes, as lowercase hex. Makes the address unique."],
  ["chainId", "integer", "The chain the address lives on, e.g. 8453 for Base."],
];

const STATES: [string, string][] = [
  ["awaiting_funds", "Waiting for the amount. balance is what has arrived so far."],
  ["funded", "It holds the amount, and Execute is executing it."],
  ["failing", "Funded, but a call reverts (a vault at capacity, say). Execute retries until expiry; message and revert say why."],
  ["settled", "Every call ran. transactionHash and blockNumber point to it."],
  ["refunding", "Past expiry with a balance, which is on its way to recovery."],
  ["refunded", "The balance went to recovery. amount says how much."],
  ["expired", "Expired with nothing to return."],
];

export default function Quickstart() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Quickstart">
        <p>
          Create an executable address, check it, and watch it execute. The Execute API lives on <code>{API_HOST}</code>.
        </p>
      </DocHead>

      <Steps>
        <Step id="api-key" title="Create an API key">
          <p>Get an API key from the dashboard. It’s secret: keep it on your server, and send it as a bearer token.</p>
          <p>
            <Link href="/dashboard" className="btn btn-primary">
              Get an API key
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </p>
          <p className="doc-small">
            Creating addresses from a web page instead? Use a <Link href={DOCS.clientId}>client ID</Link>.
          </p>
        </Step>

        <Step id="create" title="Create an executable address">
          <p>
            Call <code>POST /v1/address/create</code> with your intent. Every field is required, and nothing else is accepted.
          </p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>What it is</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map(([name, type, what]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td className="doc-table-type">{type}</td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>This intent pays a merchant 25 USDC on Base, and refunds your user anything that can’t be spent:</p>
          <Code lang="shell" code={CREATE_CURL} title="Request" />
          <Code lang="json" code={PAYMENT_RESPONSE} title="Response" />
          <p className="doc-small">
            Every field, type and error is in <Link href={DOCS.createAddress}>Create an address</Link>.
          </p>
        </Step>

        <Step id="verify" title="Verify an executable address">
          <p>
            <code>POST /v1/address/create</code> returns the executable address for your intent. There are three ways to check that the
            address belongs to your intent and nothing else:
          </p>
          <ol className="doc-list">
            <li>
              <strong>Open its page</strong> at <code>execute.cash/address/&lt;address&gt;</code>. The page fetches the address’s intent and
              recomputes the address from it, in your browser.
            </li>
            <li>
              <strong>Look it up</strong> with <Link href={DOCS.getAddress}><code>GET /v1/address/&lt;address&gt;</code></Link>, which returns
              the intent Execute holds for the address, and compare it with yours.
            </li>
            <li>
              <strong>Recompute it yourself.</strong> The address is a function of the intent, and <code>PaymentFactory</code> computes it
              onchain. This asks the factory:
            </li>
          </ol>
          <Code lang="typescript" code={VERIFY_TS} title="verify.ts" />
          <div className="doc-prompt">
            <p>Or have your coding agent do it, and explain what the address will do:</p>
            <CopyButton value={AGENT_PROMPT} label="Copy prompt for your agent" className="btn btn-quiet btn-sm" />
          </div>
        </Step>

        <Step id="pay" title="Pay it, and track its execution">
          <p>
            The address’s page, <code>execute.cash/address/&lt;address&gt;</code>, is a live monitor. Send it the tokens and watch the
            payment get detected and the intent executed and confirmed onchain.
          </p>
          <p>
            From your server, poll <Link href={DOCS.addressStatus}><code>GET /v1/address/&lt;address&gt;/status</code></Link>, or receive{" "}
            <Link href={DOCS.webhooks}>webhooks</Link> as it changes. Its <code>state</code> is one of:
          </p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {STATES.map(([state, meaning]) => (
                  <tr key={state}>
                    <td>
                      <code>{state}</code>
                    </td>
                    <td>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step id="demo" title="Try it: Execute in an app">
          <p>
            This is what integrating Execute gives your users. Enter your address, pay the executable address from any wallet, and watch it
            execute.
          </p>
          <Demo />
          <Note>It costs you 0.000001 USDC, and it comes straight back: the address’s one call transfers it to you.</Note>
        </Step>
      </Steps>
    </>
  );
}
