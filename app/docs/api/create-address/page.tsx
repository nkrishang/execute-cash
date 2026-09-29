import type { Metadata } from "next";
import Link from "next/link";
import { Code, DocHead, Endpoint, Fields, H2, Note, type FieldSpec } from "@/components/docs/prose";
import { FACTORY, MORPHO_EXAMPLE } from "@/lib/docs";
import { json, MORPHO_RESPONSE } from "@/lib/docs-snippets";
import { DOCS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Create an address",
  description: "Create an executable address for an intent.",
};

const BODY: FieldSpec[] = [
  {
    name: "token",
    type: "address",
    description: (
      <>
        The ERC-20 your user sends. It must be one of the chain’s tokens in <Link href={DOCS.chains}>List chains</Link>.
      </>
    ),
    example: '"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"',
  },
  {
    name: "amount",
    type: "string · base-10 integer",
    description: (
      <>
        Exactly what the calls spend, in the token’s base units: <code>&quot;1000000000&quot;</code> is 1,000 USDC. Anything sent above it
        goes to <code>recovery</code> before the calls run. Greater than zero.
      </>
    ),
    example: '"1000000000"',
  },
  {
    name: "calls",
    type: "array of calls · at least one",
    description: "What the address does once it holds the amount. The calls run in order, as the executable address, in one transaction; if one fails, none happens.",
    fields: [
      {
        name: "target",
        type: "address",
        description: "The contract called. It must be a contract by the time the address executes: a call to an address without code fails.",
        example: '"0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9"',
      },
      {
        name: "function",
        type: "string",
        description: (
          <>
            The function’s signature, with its parameters’ names, in the <a href="#functions">canonical form</a>. The API encodes the
            calldata from it.
          </>
        ),
        example: '"deposit(uint256 assets, address receiver)"',
      },
      {
        name: "args",
        type: "array",
        description: (
          <>
            The function’s arguments, in order, each in <a href="#values">its type’s JSON form</a>.
          </>
        ),
        example: '["1000000000", "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086"]',
      },
    ],
  },
  {
    name: "expirationTimestamp",
    type: "integer · unix seconds",
    description: (
      <>
        1 to 5 minutes from now. If the calls haven’t run by then, the address sends its whole balance to <code>recovery</code> and runs
        nothing.
      </>
    ),
    example: String(MORPHO_EXAMPLE.intent.expirationTimestamp),
  },
  {
    name: "recovery",
    type: "address",
    description:
      "Receives anything that can’t be spent: an excess, the whole balance after expiry, and anything sent late or on another chain. Usually your user.",
    example: '"0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086"',
  },
  {
    name: "salt",
    type: "string · 32 bytes, lowercase hex",
    description:
      "Makes the address unique. The same intent with the same salt gives the same address, so pick it once per payment: random, or derived from your own order id.",
    example: '"0x4b7ef6dd50ef7570851a0abfbf121fa35edfcdd5f83d07e6bc275547447ec004"',
  },
  {
    name: "chainId",
    type: "integer",
    description: (
      <>
        The chain the address settles on. One of <Link href={DOCS.chains}>List chains</Link>.
      </>
    ),
    example: "8453",
  },
];

const RESPONSE: FieldSpec[] = [
  { name: "address", type: "address", description: "The executable address, EIP-55 checksummed." },
  {
    name: "factory",
    type: "address",
    description: (
      <>
        The <code>PaymentFactory</code> that deploys it, and whose formula derives it: always <code>{FACTORY}</code> in v1.
      </>
    ),
  },
  {
    name: "intent",
    type: "object",
    description: "Your intent in canonical form. If you sent canonical values, it is your request as you sent it, except that addresses come back checksummed.",
  },
  {
    name: "terms",
    type: "string · hex",
    description: (
      <>
        <code>abi.encode(token, amount, calls, expirationTimestamp, recovery, salt, chainId)</code>, with each call’s calldata encoded:
        exactly the arguments of <code>PaymentFactory.paymentAddress</code> and <code>execute</code>.
      </>
    ),
  },
];

const VALUES: [string, string, string, string][] = [
  ["address", "string", '"0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086", or all lowercase', "a bad checksum, ENS names, no 0x"],
  ["uint<N>, int<N>", "base-10 string", '"1000000000", "0", "-5"', "JSON numbers, hex, \"1e9\", \"1000.0\", \"+1\", leading zeros"],
  ["bool", "boolean", "true", '"true", 1'],
  ["bytes<N>, bytes", "lowercase hex string", '"0x095ea7b3", "0x"', "uppercase, odd length, the wrong size"],
  ["string", "string", '"hello"', ""],
  ["T[], T[k], tuples", "array", '[["0xc80d…F086", "5"]]', "objects"],
];

const ISSUES: [string, string][] = [
  ["/<field>", "A field is missing (\"required\"), or isn’t one of the seven (\"unknown field\", with the one you probably meant)."],
  ["/token", "Not an address, or not one of the chain’s tokens. The message lists the tokens the chain supports."],
  ["/amount", "Not a base-10 integer string (hex is converted for you in the message), or zero."],
  ["/calls", "Not an array, empty, or too large to deploy: the init code is over EIP-3860’s 49,152 bytes."],
  ["/calls/<i>/target", "Not an address, or the zero address."],
  ["/calls/<i>/function", "Not in canonical form. The message gives the canonical string to send."],
  ["/calls/<i>/args", "Not an array, or the wrong number of values for the function."],
  ["/calls/<i>/args/<k>", "A value not in its type’s JSON form."],
  ["/expirationTimestamp", "Not a JSON integer, in the past, under 1 minute or over 5 minutes away. Milliseconds are spotted, and converted in the message."],
  ["/recovery", "Not an address, the zero address, the token itself, or one of Execute’s own contracts."],
  ["/salt", "Not exactly 32 bytes of lowercase hex."],
  ["/chainId", "Not a JSON integer, or a chain Execute isn’t live on. The message lists the live chains."],
];

const ERROR_EXAMPLE = json({
  error: {
    code: "invalid_intent",
    message: "3 fields are invalid",
    issues: [
      { path: "/amount", message: 'expected a base-10 integer string with no sign, decimal point or leading zeros; you sent hex, which is "1000000000" in base 10' },
      {
        path: "/calls/1/function",
        message: 'write it exactly as "deposit(uint256 assets, address receiver)" (no "function" keyword, modifiers or returns; one space after each comma)',
      },
      { path: "/expirationTimestamp", message: "looks like milliseconds; in seconds that is 1790671800" },
    ],
  },
});

export default function CreateAddress() {
  return (
    <>
      <DocHead eyebrow="Execute API" title="Create an address">
        <p>Create an executable address for an intent.</p>
      </DocHead>
      <Endpoint method="POST" path="/address/create" auth="API key or client ID" />

      <p>
        The address is a pure function of the body: the same intent always gives the same address, so retrying is always safe and needs no
        idempotency key. Every call with the same body answers <code>200</code> with the same response.
      </p>

      <H2 id="body">Request body</H2>
      <p>Every field is required, and no other is accepted.</p>
      <Fields fields={BODY} />

      <H2 id="values">Values</H2>
      <p>Every value has exactly one JSON form, the same for top-level fields and call arguments:</p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>ABI type</th>
              <th>JSON</th>
              <th>Accepted</th>
              <th>Refused</th>
            </tr>
          </thead>
          <tbody>
            {VALUES.map(([type, form, ok, refused]) => (
              <tr key={type}>
                <td>
                  <code>{type}</code>
                </td>
                <td>{form}</td>
                <td>
                  <code>{ok}</code>
                </td>
                <td>{refused}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="doc-list">
        <li>
          Integers are strings because JSON numbers lose precision past 2<sup>53</sup>. Base 10 is what <code>bigint.toString()</code>{" "}
          writes.
        </li>
        <li>
          <code>chainId</code> and <code>expirationTimestamp</code> are JSON integers: small, and held as numbers by every library.
        </li>
        <li>Addresses may be all lowercase or EIP-55 checksummed; any other casing must be a valid checksum. Responses are checksummed.</li>
      </ul>

      <H2 id="functions">Functions</H2>
      <p>
        A call names its function by its signature, with every parameter named: <code>name(type name, …)</code>, one space after each
        comma. Tuples list their named components in parentheses.
      </p>
      <Code
        lang="plaintext"
        code={`transfer(address to, uint256 amount)
deposit(uint256 assets, address receiver)
supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
fill((address maker, uint256 amount)[] orders, bytes32 id)`}
        title="Canonical signatures"
      />
      <p>
        There’s no <code>function</code> keyword, visibility, mutability or <code>returns</code>, and types are canonical (
        <code>uint256</code>, never <code>uint</code>). It’s the form viem, ethers and alloy print a function in. Anything else is refused,
        and the error gives the canonical string. Raw calldata isn’t accepted, so a wallet can always show every call in words.
      </p>

      <H2 id="response">Response</H2>
      <Fields fields={RESPONSE} />

      <H2 id="example">Example</H2>
      <p>A deposit of 1,000 USDC into Morpho’s Steakhouse Prime USDC vault on Base, with the vault’s shares going to the user:</p>
      <Code lang="json" code={json(MORPHO_EXAMPLE.intent)} title="Request body" />
      <Code lang="json" code={MORPHO_RESPONSE} title="200 OK" />

      <H2 id="errors">Errors</H2>
      <p>
        An invalid intent is refused with <code>400 invalid_intent</code>, and every problem is reported at once, each at a JSON Pointer into
        your body:
      </p>
      <Code lang="json" code={ERROR_EXAMPLE} title="400 Bad Request" />
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Refused when</th>
            </tr>
          </thead>
          <tbody>
            {ISSUES.map(([path, when]) => (
              <tr key={path}>
                <td>
                  <code>{path}</code>
                </td>
                <td>{when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>The request can also be refused for its credentials, or with:</p>
      <ul className="doc-list">
        <li>
          <code>409 address_conflict</code>: the same calldata was already registered with different function signatures. The message names
          the registered ones.
        </li>
        <li>
          <code>401</code>, <code>403</code> and <code>429</code>: see <Link href={DOCS.authentication}>Authentication</Link>.
        </li>
      </ul>
      <Note>
        Create checks the intent without reading the chain. It doesn’t check that the calls will succeed, which depends on chain state when
        the address is paid. If they revert then, Execute retries until expiry and refunds <code>recovery</code>.
      </Note>
    </>
  );
}
