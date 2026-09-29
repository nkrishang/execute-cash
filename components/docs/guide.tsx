import Link from "next/link";
import type { ReactNode } from "react";
import { Code, DocHead, Note, Step, Steps } from "@/components/docs/prose";
import { API_URL, BASE_USDC } from "@/lib/docs";
import { DOCS } from "@/lib/links";

/*
 * Every guide has the same shape: what it builds, then the quickstart's steps with each contract,
 * function and argument spelled out and justified.
 */

export type GuideArg = { name: string; value: string; why: ReactNode };
export type GuideCall = { contract: string; address: string; function: string; why: ReactNode; args: GuideArg[] };

export type Guide = {
  title: string;
  /** The first line: what Execute lets your app do. */
  intro: ReactNode;
  /** What gets built, in a paragraph. */
  summary: ReactNode;
  /** What the user has once the address settles, following "Once it’s settled, ". */
  settled: ReactNode;
  contracts: { name: string; address: string; role: ReactNode }[];
  calls: GuideCall[];
  /** The shell variables the request uses: name, example value and what it is. */
  variables: [string, string, string][];
  /** Which variable is `recovery`, and why. */
  recovery: { variable: string; why: ReactNode };
  notes?: ReactNode;
};

const basescan = (address: string) => `https://basescan.org/address/${address}`;

/** The request, ready for a shell: variables for the user's values, a fresh expiry, a random salt. */
function curl(guide: Guide) {
  const value = (v: string) => (v.startsWith("$") ? `"'${v}'"` : `"${v}"`);
  const calls = guide.calls
    .map(
      (call) => `      {
        "target": "${call.address}",
        "function": "${call.function}",
        "args": [${call.args.map((a) => value(a.value)).join(", ")}]
      }`,
    )
    .join(",\n");
  const width = Math.max(...guide.variables.map(([name, example]) => name.length + example.length + 1)) + 3;
  const vars = guide.variables.map(([name, example, what]) => `${`${name}=${example}`.padEnd(width)}# ${what}`).join("\n");
  return `${vars}

curl ${API_URL}/address/create \\
  -H "Authorization: Bearer $EXECUTE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "${BASE_USDC}",
    "amount": ${value("$AMOUNT")},
    "calls": [
${calls}
    ],
    "expirationTimestamp": '$(( $(date +%s) + 300 ))',
    "recovery": ${value(`$${guide.recovery.variable}`)},
    "salt": "0x'$(openssl rand -hex 32)'",
    "chainId": 8453
  }'`;
}

export function GuidePage({ guide }: { guide: Guide }) {
  return (
    <>
      <DocHead eyebrow="Guides" title={guide.title}>
        <p>{guide.intro}</p>
      </DocHead>

      <p>{guide.summary}</p>

      <Steps>
        <Step id="api-key" title="Get an API key">
          <p>
            Create one in the <Link href="/dashboard">dashboard</Link>, and keep it on your server. From a web page, use a{" "}
            <Link href={DOCS.clientId}>client ID</Link> instead.
          </p>
        </Step>

        <Step id="contracts" title="The contracts">
          <p>Everything happens on Base. The intent calls these contracts, and nothing else:</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Address</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {guide.contracts.map((c) => (
                  <tr key={c.address}>
                    <td className="doc-nowrap">{c.name}</td>
                    <td>
                      <a href={basescan(c.address)} target="_blank" rel="noopener noreferrer" title={c.address}>
                        <code>
                          {c.address.slice(0, 6)}…{c.address.slice(-4)}
                        </code>
                      </a>
                    </td>
                    <td>{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step id="intent" title="The intent">
          <p>
            The token is USDC, and the amount is in its base units: USDC has 6 decimals, so 100 USDC is <code>&quot;100000000&quot;</code>.
            Once the address holds exactly the amount, it makes {guide.calls.length === 1 ? "this call" : "these calls"}, as itself, in one
            transaction:
          </p>
          {guide.calls.map((call, i) => (
            <div key={call.function} className="doc-call">
              <p className="doc-call-head">
                <span className="doc-call-n">{i + 1}</span>
                <code>{call.function}</code>
                <span className="doc-call-on">on {call.contract}</span>
              </p>
              <p>{call.why}</p>
              <div className="doc-table-wrap">
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th>Argument</th>
                      <th>Value</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {call.args.map((a) => (
                      <tr key={a.name}>
                        <td>
                          <code>{a.name}</code>
                        </td>
                        <td className="doc-nowrap">
                          <code title={a.value}>{/^0x[0-9a-fA-F]{40}$/.test(a.value) ? `${a.value.slice(0, 6)}…${a.value.slice(-4)}` : a.value}</code>
                        </td>
                        <td>{a.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p>
            <code>recovery</code> is <code>${guide.recovery.variable}</code>: {guide.recovery.why}
          </p>
        </Step>

        <Step id="create" title="Create the address">
          <p>
            Post the intent to <Link href={DOCS.createAddress}>Create an address</Link>. The expiry is 5 minutes away and the salt is random,
            so every run gives a new address:
          </p>
          <Code lang="shell" code={curl(guide)} title="Request" />
          <p>
            The response’s <code>address</code> is the executable address. Check it as <Link href={`${DOCS.quickstart}#verify`}>the
            quickstart</Link> shows before you show it to anyone.
          </p>
        </Step>

        <Step id="show" title="Show it to your user">
          <p>
            Show the address with the exact amount, the token and the chain, in words, and a way to copy each. Beside them, a QR code of an
            EIP-681 payment request lets your user’s wallet fill in the chain, the token and the amount by itself:
          </p>
          <Code
            lang="typescript"
            code={
              "// address and intent, from the create response\nconst request = `ethereum:${intent.token}@${intent.chainId}/transfer?address=${address}&uint256=${intent.amount}`;"
            }
            title="Payment request"
          />
          <p>
            <code>uint256</code> is in the token’s base units, like the intent’s <code>amount</code>. Say under the code what it fills in, and
            offer a plain code of the address alone for wallets that can’t read a request; your user then picks the token and chain and enters
            the amount themselves. The address’s page, <code>execute.cash/address/&lt;address&gt;</code>, shows your user what paying it will
            do.
          </p>
          <p>Your user pays with an ordinary transfer, from any wallet or exchange. They connect nothing and approve nothing.</p>
        </Step>

        <Step id="track" title="Track it">
          <p>
            Poll <Link href={DOCS.addressStatus}>the address’s status</Link>, or get <Link href={DOCS.webhooks}>webhooks</Link>. Once it’s{" "}
            <code>settled</code>, {guide.settled}
          </p>
          {guide.notes}
        </Step>
      </Steps>

      <Note>
        Every executable address is single-use and expires within minutes. Anything sent late or above the amount goes to{" "}
        <code>recovery</code>, and so does everything if the calls can’t run before expiry.
      </Note>
    </>
  );
}
