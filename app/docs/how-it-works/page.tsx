import type { Metadata } from "next";
import Link from "next/link";
import { FlowDiagram, IntentDiagram, RecoveryDiagram } from "@/components/docs/diagrams";
import { ExampleDebugger } from "@/components/docs/example-debugger";
import { DocHead, H2, Mark } from "@/components/docs/prose";
import { FACTORY_SOURCE, PAYMENT_SOURCE } from "@/lib/docs";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "How it works",
  description: "Every execution intent maps to one blockchain address, hardwired to do exactly what the intent says.",
};

const FIELDS: [string, string][] = [
  ["token", "The ERC-20 the address accepts."],
  ["amount", "Exactly how much of it the calls spend."],
  ["calls", "The contracts it calls, the functions and the arguments, in order."],
  ["expirationTimestamp", "When it stops waiting, and returns what it holds."],
  ["recovery", "Where anything that can’t be spent goes."],
  ["salt", "What makes it unique among identical intents."],
  ["chainId", "The one chain it executes on."],
];

const Payment = () => (
  <a href={PAYMENT_SOURCE} target="_blank" rel="noopener noreferrer">
    <code>Payment</code>
  </a>
);

export default function HowItWorks() {
  return (
    <>
      <DocHead eyebrow="Resources" title="How it works">
        <p>Every execution intent maps to one blockchain address.</p>
      </DocHead>

      <H2 id="intent">An intent</H2>
      <p>An intent is seven values, and every one of them is part of its address:</p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>What it fixes</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(([name, what]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The address is the counterfactual address of a smart contract that isn’t deployed yet, and that’s hardcoded to route your funds and
        make its calls exactly as you, or an app, intend. That contract is <Payment />.
      </p>
      <IntentDiagram />

      <H2 id="execution">From payment to execution</H2>
      <p>
        You send exactly 100 USDC to the address. <Mark of="execute" /> Execute detects it, and deploys the <Payment /> contract, which
        executes your actions. The deployment is a call to{" "}
        <a href={FACTORY_SOURCE} target="_blank" rel="noopener noreferrer">
          <code>PaymentFactory</code>
        </a>
        : permissionless, non-upgradeable and non-custodial, and deployed at the same address on{" "}
        <Link href={DOCS.supportedChains}>every chain</Link>.
      </p>
      <FlowDiagram />
      <p>
        Execute holds no funds and no keys to the address: nobody does. It only sends the transaction the terms already decide, and anyone
        could send it instead.
      </p>

      <H2 id="recovery">Recovery</H2>
      <p>
        <Payment /> also handles funds that arrive when the intent can’t run as written: the wrong token, part of the amount, after expiry,
        more than the amount, or a call that fails.
      </p>
      <RecoveryDiagram />

      <H2 id="verification">Verification</H2>
      <p>
        Every executable address can be checked before a single token is sent to it. The address is computed from its terms: the token, the
        exact amount and every call it will make. Anyone can recompute it before sending, and change one byte and it’s a different address.
      </p>
      <p>
        Any address can be checked at <code>execute.cash/address/&lt;address&gt;</code>. This is that page’s check, on the vault deposit
        above: it reads each field from the terms, hashes them in your browser, and compares the result with the address. Change a byte to
        see the address move.
      </p>
      <ExampleDebugger />
    </>
  );
}
