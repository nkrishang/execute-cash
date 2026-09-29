# Execute API

Design for the API behind execute.cash. An app turns an execution intent into an executable address with `POST /v1/address/create`. A wallet turns that address back into its intent with `GET /v1/address/{address}`. It sits on gum-contracts' `PaymentFactory` and `Payment` unchanged.

Proposed 2026-09-29, and implemented the same day in [execute-server](../../execute-server) (the API) and this site (the dashboard and address pages), with the decisions listed at the end.

## The whole API

```
POST /v1/address/create            intent → executable address       API key or client ID
GET  /v1/address/{address}         executable address → intent       public, immutable
GET  /v1/address/{address}/status  where the money is now            public
GET  /v1/chains                    chains the factory is live on     public
```

An app posts an intent and shows its user the address. The user pastes the address into any wallet. The wallet looks it up and checks it by recomputing the address. It then pre-fills the chain, token and amount, and shows in words what sending will do. Execute executes the address once the funds land.

## Principles

1. **One spelling per value.** A chain is `8453`, never `"base"` or `"0x2105"`. An amount is `"1000000000"`, never `1000000000`, `"1000.0"` or `"0x3b9aca00"`. Address case is the one exception, explained under [Values](#values).
2. **Every field is required, and nothing else is accepted.** There are no optional fields, no defaults and no unknown keys. A request states everything that determines its address.
3. **Same request, same address, forever.** The response is a pure function of the body. The address never depends on server randomness, the server's clock or hidden configuration. Retries need no idempotency key, and you can compute the address yourself before asking.
4. **The contract's names.** The keys are `PaymentFactory.paymentAddress`'s parameter names, in its order: `token, amount, calls, expirationTimestamp, recovery, salt, chainId`.
5. **Strict, and says exactly what it wanted.** Every rejection names the field and gives the value it would have accepted.
6. **Nothing to trust.** Whoever receives an address or an intent can recompute one from the other.

## POST /v1/address/create

A deposit of 1,000 USDC into Morpho's Steakhouse Prime USDC vault on Base, with the shares going to the user:

```http
POST /v1/address/create
Authorization: Bearer exe_sk_…
Content-Type: application/json

{
  "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "amount": "1000000000",
  "calls": [
    {
      "target": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "function": "approve(address spender, uint256 amount)",
      "args": ["0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9", "1000000000"]
    },
    {
      "target": "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9",
      "function": "deposit(uint256 assets, address receiver)",
      "args": ["1000000000", "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086"]
    }
  ],
  "expirationTimestamp": 1800000000,
  "recovery": "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086",
  "salt": "0x4b7ef6dd50ef7570851a0abfbf121fa35edfcdd5f83d07e6bc275547447ec004",
  "chainId": 8453
}
```

| Field | JSON | Meaning |
| --- | --- | --- |
| `token` | address | The ERC-20 the payer sends: one `GET /v1/chains` lists for the chain (USDC, USDT or AUSD today). |
| `amount` | base-10 string | Exactly what the calls spend, in base units (`"1000000000"` is 1,000 USDC). Anything above it goes to `recovery` before the calls run. |
| `calls` | array of `{target, function, args}`, at least one | Run in order, as the executable address, once it holds `amount`. |
| `expirationTimestamp` | integer, unix seconds | After this, the whole balance goes to `recovery` and no call runs. |
| `recovery` | address | Receives any excess, the whole balance after expiry, and anything sent late or on another chain. Usually the user. |
| `salt` | 32 bytes, lowercase hex | Makes the address unique. The same intent with the same salt gives the same address. |
| `chainId` | integer | The only chain the address settles on. |

### Values

One JSON form per ABI type. The same rules apply to the top-level fields and to every call argument.

| ABI type | JSON | Accepted | Rejected |
| --- | --- | --- | --- |
| `address` | string | `"0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086"`, or all lowercase | a bad checksum, ENS names, no `0x` |
| `uint<N>`, `int<N>` | base-10 string | `"1000000000"`, `"0"`, `"-5"` | JSON numbers, hex, `"1e9"`, `"1000.0"`, `"+1"`, leading zeros |
| `bool` | boolean | `true` | `"true"`, `1` |
| `bytes<N>`, `bytes` | lowercase hex string | `"0x095ea7b3"`, `"0x"` | uppercase, odd length, wrong size |
| `string` | string | `"hello"` | |
| `T[]`, `T[k]`, tuples | array | `[["0xc80d…F086", "5"]]` | objects |
| `chainId`, `expirationTimestamp` | integer | `8453`, `1800000000` | strings, hex, chain names, milliseconds, RFC 3339 |

- **Addresses accept two cases** because the two ecosystems disagree by default: viem and ethers write EIP-55 checksums, while alloy's serde writes lowercase. Both spell the same 20 bytes. Any other casing must be a valid checksum, so a typo in a checksummed address is caught. Responses always checksum.
- **`uint256` is a string** because JSON numbers lose precision past 2^53, and `JSON.parse` rounds them silently. It is base 10 because `bigint.toString()` and `U256::to_string()` produce it, and a person reads `"1000000000"` as 1,000 USDC but can't read `"0x3b9aca00"`. Every integer argument follows this rule whatever its width, so nobody has to wonder whether a `uint64` is a number.
- **`chainId` and `expirationTimestamp` are JSON integers.** They are small, and every library already holds them as numbers (viem's `chain.id`, alloy's `u64`). Making them strings would add friction without making anything safer.
- **Tuples are positional arrays**, like `args` itself. The function string already names every component.

### Calls: a function and its arguments, never raw calldata

```json
{
  "target": "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9",
  "function": "deposit(uint256 assets, address receiver)",
  "args": ["1000000000", "0xc80d2a01247aD9e11D1Ab45B5AcE404B416aF086"]
}
```

- `target` is the contract called (`Payment.Call.target`). It isn't named `to` because the recipient in `transfer(address to, uint256 amount)` is also a "to".
- `function` is the function's signature with parameter names.
- `args` are its arguments, in order, each in its type's JSON form.

The API ABI-encodes the calldata itself, and there is no `data` field. This is what makes the second half of the loop possible:

- **Every address the API creates can be shown in words by any wallet.** Raw calldata can only be read by guessing an ABI from a selector database. A 4-byte selector is ambiguous and can be spoofed.
- **The API is the encoder**, so what a wallet displays and what executes can't disagree.
- **The contracts stay permissionless.** Anyone who wants raw calldata can call `PaymentFactory` directly. The API is the path that guarantees readability.

A call carries only the called function's signature, not the contract's whole ABI. That signature is the exact schema for these bytes, and it is what the address commits to (below).

### `function`: one canonical form

```
function   = name "(" [ param *( ", " param ) ] ")"
param      = type " " name
type       = ( elementary / "(" param *( ", " param ) ")" ) *( "[" [ digits ] "]" )
elementary = address / bool / string / bytes / bytes1 … bytes32 / uint8 … uint256 / int8 … int256
name       = a Solidity identifier that isn't a keyword
```

For example, `deposit(uint256 assets, address receiver)` or `fill((address maker, uint256 amount)[] orders, bytes32 id)`.

- There is no `function` keyword, visibility, mutability, `returns (…)` or data location. Types are canonical: `uint256`, never `uint`.
- Every parameter is named, tuple components included, and names are unique within their list. The names are the labels a wallet shows.
- It is the inputs half of what abitype's `formatAbiItem` and ethers' `format("full")` print, i.e. `` `${f.name}(${formatAbiParameters(f.inputs)})` ``. ethers' `FunctionFragment.from` and alloy's `Function::parse` read it as it is. viem reads it with ``parseAbiItem(`function ${fn}`)``.
- Anything else is rejected, and the error contains the canonical string.

The form is this strict because the string is what a wallet shows, and the registry compares it byte for byte (see Labels, below).

### Labels are not committed (yet)

Calldata commits to the arguments and to a function's 4-byte selector, and to nothing else. Parameter names aren't in it at all, and the function name is in it only through 32 bits of a hash. So the same address can be described with different labels:

- `deposit(uint256 assets, address receiver)` and `deposit(uint256 assets, address feeCollector)` encode identically.
- So does a look-alike name with the same selector, found by brute force in about 2^32 tries, which takes minutes on a laptop.

**Today:** the registry serves the signatures of the first registration. A later registration of the same calldata with different signatures is refused with `409 address_conflict`, which names the existing signature. With random salts nobody can predict an intent before its app registers it, so nobody can register misleading labels first.

**Deferred:** to make every label part of the address itself, the factory's salt would bind the caller's salt to the signatures. This is the pattern of Safe's proxy factory (`keccak256(keccak256(initializer) ++ saltNonce)`) and of `WithdrawalForwarder`'s nonce:

```
salt' = keccak256(abi.encode(salt, functions))    // functions: string[], one per call, in order
```

That would make the registry purely content-addressed: no first write, no conflicts. It costs one hash in every verifier, and it changes every address, the landing page's included. Rename `receiver` to `beneficiary` in the example and the address would change from `0xdBFa…B44F` to `0x642B…E99B`.

### Salt

The salt is required, the caller chooses it, and it is passed to `PaymentFactory` as it is. The same intent with the same salt gives the same address, which leaves two good choices:

- **Random**, with `salt()` in the SDK, when every call should produce a new address.
- **Derived from your own record**, e.g. `keccak256(orderId)` with `saltFrom(order.id)`, when the address should be a function of the order. Retries converge, and you never need to store the address.

Either way, choose the salt and `expirationTimestamp` once per payment and reuse them on retries. Calling `Date.now()` again on each retry produces a different intent.

An executable address is single-use. Creating an intent that has already executed returns its spent address, and anything sent there goes to `recovery`.

A server-generated salt would make the response depend on hidden randomness. Every retry would then produce a new address, so the API would need an `Idempotency-Key`, and nobody could compute the address before asking.

### Factory

There is no `factory` field. `/v1` is pinned for life to `PaymentFactory` `0x6D85B9706D8f076cB8A9fEA37d70Fcb8D22C2952`. The contracts are immutable, so a v1 request returns the same address for as long as the chain exists. A new contract generation will arrive as `/v2`, and `/v1` stays served. The response names the factory, so a verifier knows which formula applies.

### Response

```jsonc
{
  "address": "0x461Dc8912aaB2840c401d987964bdf02D4E32935",
  "factory": "0x6D85B9706D8f076cB8A9fEA37d70Fcb8D22C2952",
  "intent": { /* the request body, in canonical form */ },
  "terms": "0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913…"
}
```

| Field | |
| --- | --- |
| `address` | The executable address, EIP-55 checksummed. |
| `factory` | The `PaymentFactory` that deploys it, and whose CREATE2 formula derives it. |
| `intent` | Your intent in canonical form. If you sent canonical values, it is your request byte for byte. Only address case can differ. |
| `terms` | `abi.encode(token, amount, calls, expirationTimestamp, recovery, salt, chainId)` with the calls encoded. These are exactly the calldata arguments of `paymentAddress` and `execute`. Sent to the factory, `0x8809f6b6 ++ terms` returns `address` (an onchain check), and `0xc5cdfc83 ++ terms` executes the address (anyone may). |

Create always answers `200 OK`, on the first request and on the hundredth. The body is the same both times, so the status code is too.

### What create checks, and what it doesn't

Create checks the following without reading the chain:

- The body has exactly the seven fields, each in canonical form. A misspelled key is named, with the key it probably meant.
- `amount` is greater than zero, there is at least one call, and `token`, `recovery` and every `target` are nonzero.
- `chainId` is one that `GET /v1/chains` lists, and `token` is one of that chain's tokens.
- `expirationTimestamp` is between 1 and 5 minutes from now. A timestamp in milliseconds is caught, and the error gives it in seconds. Five minutes is also the longest a user's funds can wait if the calls cannot run.
- Each `function` is canonical, and each `args` matches its parameters.
- The init code fits EIP-3860's 49,152 bytes, the same limit `paymentAddress` enforces.

Create does not check that the calls succeed, that they spend exactly `amount`, or that the token and targets have code. Those depend on chain state that changes between creating and paying, so checking them in create would make its answer depend on when you asked. The question "if this were funded now, would it settle?" belongs to a separate `POST /v1/address/simulate`. It takes the same body and answers `settles`, or the decoded revert, at a stated block. Apps call it when they want it, and wallets can call it too.

### Errors

```json
{
  "error": {
    "code": "invalid_intent",
    "message": "2 fields are invalid",
    "issues": [
      { "path": "/amount", "message": "expected a base-10 integer string; you sent hex, which is \"1000000000\" in base 10" },
      { "path": "/calls/1/function", "message": "write it exactly as \"deposit(uint256 assets, address receiver)\"" }
    ]
  }
}
```

Every issue is reported at once, with a JSON Pointer into the body. The other codes are:

- `unauthorized` (401), `rate_limited` (429), `not_found` (404, lookups) and `unavailable` (503);
- `address_conflict` (409), for the same calldata with other signatures;
- the credential refusals below (403).

For all of them `issues` is `[]`.

### Credentials

Creating takes one of an account's two credentials. Both come from the dashboard at execute.cash.

| Credential | Header | Used from |
| --- | --- | --- |
| API key `exe_sk_…`, secret | `Authorization: Bearer exe_sk_…` | Servers only. A request carrying it and an `Origin` header came from a browser, and is refused with `403 api_key_in_browser`, so a key pasted into a web page fails loudly. |
| Client ID `exe_client_…`, publishable | `X-Client-Id: exe_client_…` | Web pages. The browser's `Origin` must be one the account allows (`https://app.example.com`, or `https://*.example.com` for subdomains). Otherwise the request fails with `403 origin_not_allowed`, or `403 origin_required` without an `Origin`. |

A request sends exactly one of them. Each has its own rate limit.

Outside a browser anyone can send any `Origin`. But a client ID only creates addresses, which is harmless, so it is treated as public and can be rotated.

The public routes answer CORS with `*`, because nothing is sent with cookies and the origin check happens on the server.

## The loop

1. The app calls create and shows the address. It can also show an EIP-681 QR code (`ethereum:<token>@<chainId>/transfer?address=<address>&uint256=<amount>`), so a scanning wallet pre-fills the transfer.
2. The user pastes or scans it in their wallet.
3. The wallet calls `GET /v1/address/{address}` and recomputes the address from the intent. It then shows:
   - the chain, token and amount to send, pre-filled and locked;
   - each call, in words;
   - where the money goes if the calls can't run, and when.
4. The user sends. Execute sees the balance reach `amount` and calls `execute`.
5. Both sides watch the status, and the app can also get a webhook.

### GET /v1/address/{address}

The lookup returns the same body as create. It returns `404 not_found` when Execute has no intent for the address, for example an ordinary account or an address made with the contracts directly.

- **Immutable.** An address's intent can never change, so responses carry `Cache-Control: public, max-age=31536000, immutable`. They can be cached by a CDN and mirrored.
- **Public.** Knowing the address is the capability. The intent goes onchain in the `execute` calldata a few seconds after funding anyway.
- **Unforgeable.** A lookup service can withhold an intent but can't misstate one, because a wrong intent doesn't derive the address. Wallets can use any mirror.

### Verifying

Whoever receives an address or an intent verifies it. Asking a server whether the server is right proves nothing.

```
data     = selector(function) ++ abi.encode(args)          for each call
terms    = abi.encode(token, amount, [(target, data), …], expirationTimestamp, recovery, salt, chainId)
initCode = Payment.creationCode ++ abi.encode(CREATE(factory, nonce 1), terms)
address  = keccak256(0xff ++ factory ++ bytes32(0) ++ keccak256(initCode))[12:]
```

Verify only against known factories. A factory's nonce-1 implementation is the code behind every stub's `recover`, so an intent that names an unknown factory could send late funds anywhere. The SDK pins the factories it knows and rejects any other, and so should any wallet.

The proof covers what will be called, not who is behind it. Knowing that `0xbeef…73C9` is Morpho's Steakhouse vault is the wallet's job, from its own contract labels or from ERC-7730 descriptors. What the wallet must make unmissable is where the money can end up: every address in the calls and `recovery`, marked "you" when it is the sender.

### Status

```
GET /v1/address/{address}/status
```

The status is a tagged union. Each state carries its own fields and no others, plus `address` and `updatedAt`:

```jsonc
{ "state": "awaiting_funds", "balance": "0" }
{ "state": "funded",         "balance": "1000000000" }
{ "state": "failing",        "balance": "1000000000", "message": "settlement call 1 (to 0xbeef…) reverted: vault is full", "revert": { /* decoded */ } }
{ "state": "settled",        "transactionHash": "0x…", "blockNumber": 36120001 }
{ "state": "refunding",      "balance": "1000000000" }
{ "state": "refunded",       "transactionHash": "0x…", "blockNumber": 36120001, "amount": "1000000000" }
{ "state": "expired",        "balance": "0" }
```

- **`failing`:** the address is funded but `execute` reverts, e.g. because the vault is at capacity. Execute retries with backoff until expiry.
- **`refunding`:** the address is past expiry with a balance, and `execute` is returning it to `recovery`. That happens on the first execute after expiry, from `failing` or from `awaiting_funds` with part of the amount.
- **Late payments:** the address stays watched for a day past expiry. A payment to an `expired` address is refunded too.
- **`revert`** is decoded the way gum-server decodes settlement failures today.

### Keeping intents available

Only someone holding an address's intent can execute it. If every copy were lost, funds sent there would be locked for good: `recover` needs the stub, the stub needs `execute`, and `execute` needs the terms. So the registry is safety-critical data, and it is built to be copied:

- Entries verify themselves, so mirrors can sync from each other and check every entry.
- The registry should be exportable in bulk, for example as daily dumps.
- Apps keep their own copy, or derive intents from their records with deterministic salts.

## SDK

The SDK is where convenience lives, so the API doesn't have to provide it. It takes each library's native values and sends the strict wire format. It follows two rules:

- **It never hands you an address it hasn't derived itself.** `createAddress` and `lookup` recompute the address locally and throw `AddressMismatchError` if the server disagrees.
- **It invents nothing.** There is no default expiry, no implicit salt and no default URL. What you pass is what is sent.

### TypeScript

```ts
import { createAppClient, call, saltFrom, EXECUTE_CASH_API } from "@execute-cash/sdk";

const execute = createAppClient({ url: EXECUTE_CASH_API, apiKey: process.env.EXECUTE_API_KEY! });

const { address } = await execute.createAddress({
  token: USDC,
  amount, // bigint
  calls: [
    call(USDC, "approve(address spender, uint256 amount)", [VAULT, amount]),
    call(VAULT, "deposit(uint256 assets, address receiver)", [amount, user]),
  ],
  expirationTimestamp: order.createdAt + 3600, // unix seconds, fixed per order
  recovery: user,
  salt: saltFrom(order.id), // keccak256 of the id
  chainId: 8453,
});
```

Every field here is a function of the order, so a retry, or a page that calls this on every render, gets the same address.

`call` types its `args` from the signature string itself, because abitype parses the string at the type level. `[amount, user]` is checked as `[bigint, Address]`, so a wrong type or count is a compile error.

### viem

```ts
import { erc20Abi, erc4626Abi } from "viem";
import { fromViem } from "@execute-cash/sdk/viem";

calls: [
  fromViem({ to: USDC, abi: erc20Abi, functionName: "approve", args: [VAULT, amount] }),
  fromViem({ to: VAULT, abi: erc4626Abi, functionName: "deposit", args: [amount, user] }),
],
```

The argument has exactly the shape of an entry in viem's `sendCalls({ calls })`. An app that batches calls through a connected wallet today can move to Execute by wrapping the same objects. viem's own inference applies: an unknown `functionName`, wrong `args` or a view function doesn't compile.

### ethers

```ts
import { Contract } from "ethers";
import { fromEthers } from "@execute-cash/sdk/ethers";

const vault = new Contract(VAULT, ["function deposit(uint256 assets, address receiver) returns (uint256 shares)"]);
calls: [fromEthers(vault, "deposit", [amount, user])],
```

ethers users can also use the core `call`. The canonical string is a human-readable ABI fragment, which ethers reads natively.

### In a wallet

```ts
import { createReadClient, decodeCall, EXECUTE_CASH_API } from "@execute-cash/sdk";

const execute = createReadClient({ url: EXECUTE_CASH_API });
const exe = await execute.lookup(recipient); // null: Execute knows no intent for this address

if (exe) {
  // Verified: exe.intent derives exe.address under a known factory.
  prefill({ chainId: exe.intent.chainId, token: exe.intent.token, amount: exe.intent.amount });
  exe.intent.calls.map(decodeCall);
  // [{ name: "approve", inputs: [...] },
  //  { name: "deposit", inputs: [{ name: "assets", type: "uint256", value: 1000000000n },
  //                              { name: "receiver", type: "address", value: "0xc80d…F086" }] }]
}
```

The SDK also has these pure helpers:

- `deriveAddress(factory, intent)` and `verify(exe)`, which work offline.
- `toJson(intent)` and `fromJson(json)`, for the wire form. `fromJson` validates exactly as the API does, for storing intents or handing them to another service.
- `paymentUri(exe)`, the EIP-681 URI for a QR code.
- `salt()` and `saltFrom(id)`.

The core depends on abitype and ox, the libraries viem is built on. viem apps add almost nothing, and ethers apps don't pull in viem. The viem and ethers adapters are separate entry points. The `Payment` creation code of each known factory (2,042 bytes) is bundled.

### Rust

```rust
use alloy::sol;
use execute::{AppClient, Call, Intent, EXECUTE_CASH_API};

sol! {
    #[sol(abi)] interface IERC20   { function approve(address spender, uint256 amount) external returns (bool); }
    #[sol(abi)] interface IERC4626 { function deposit(uint256 assets, address receiver) external returns (uint256 shares); }
}

let execute = AppClient::new(EXECUTE_CASH_API, api_key);
let exe = execute
    .create_address(&Intent {
        token: USDC,
        amount,
        calls: vec![
            Call::new(USDC, IERC20::approveCall { spender: VAULT, amount }),
            Call::new(VAULT, IERC4626::depositCall { assets: amount, receiver: user }),
        ],
        expiration_timestamp: order.created_at + 3600,
        recovery: user,
        salt: execute::salt_from(&order.id),
        chain_id: 8453,
    })
    .await?;
```

`Call::new` takes any `sol!` call. `#[sol(abi)]` supplies the parameter names, and alloy 1.7 formats the two calls above in exactly the canonical form. `Intent` serializes to the wire format, so a service can also store or forward intents with serde. `intent.address(&FACTORY_V1)` derives the address offline.

### Without an SDK

The wire format is chosen so that each language's defaults are nearly right:

- **JavaScript:** `JSON.stringify` refuses bigints, which forces `amount.toString()`, and that is the canonical form.
- **Rust:** alloy's `Address` (lowercase), `B256` (lowercase hex) and `u64` all serialize to accepted forms. `U256` serializes as hex, so annotate it with `#[serde_as(as = "DisplayFromStr")]`.

## Not in the API, on purpose

| Left out | Because |
| --- | --- |
| `data` on calls | Wallets can't read it. The contracts take raw calldata directly. |
| `receiver` | A plain payment is one call: `transfer(address to, uint256 amount)`. |
| Token symbols, chain names, decimal amounts, durations, dates | One spelling per value. |
| Server-chosen salts, `Idempotency-Key` | Determinism makes retries safe on its own. |
| `factory` | The API version pins it. |
| Per-request `webhook_url`, `reference`, `metadata` | These are account settings, and your salt can be your reference. |
| `value` on calls | `Payment` calls carry no native value. |
| Simulation inside create | It depends on chain state, so it has its own endpoint. |
| Names for targets ("Morpho vault") | The intent carries structure, not claims. Wallets name contracts from their own sources. |

## From gum-server's /v1/deposit

| gum-server | Execute |
| --- | --- |
| `chain_id`: an id, a numeric string or a slug | `chainId`: an integer |
| `token`: a symbol or an address | `token`: an address |
| `receiver`: one transfer | `calls`: any calls, as signature and args |
| `expires_at`: RFC 3339, truncated to seconds | `expirationTimestamp`: unix seconds |
| `recovery`: Gum's own address | `recovery`: yours, usually the user's |
| `salt`: random per request | `salt`: yours |
| `reference`, `webhook_url`: optional | gone |
| `Idempotency-Key`: optional header | not needed |
| Key in `Authorization: Bearer` or `X-Api-Key` | API key in `Authorization: Bearer`, servers only; client ID in `X-Client-Id`, allowed origins only |

## Decided on 2026-09-29

1. **Labels are not committed into the salt, for now.** The registry serves the first registration's signatures and refuses conflicting ones (see Labels).
2. **Expiry is 1 to 5 minutes from now.**
3. **Two credentials.** A secret API key works only from servers. A publishable client ID works only from the origins the account allows.
4. **Tokens are USDC, USDT and AUSD, per chain, as gum-indexer watches them.** Vault share tokens come next: adding one is a config change in gum-indexer, then in execute-server. execute-server checks every few minutes that gum-indexer watches each token it accepts.

## Known-answer vector

The request above gives these values:

| Value | |
| --- | --- |
| `address` | `0x461Dc8912aaB2840c401d987964bdf02D4E32935`, the landing page's Morpho address |
| `terms` (704 bytes) | below |

Checked on 2026-09-29:

- `PaymentFactory.paymentAddress` on Base returns this address for these terms.
- execute-server derives it in its tests.
- The address page recomputes it in the browser with viem.

With the deferred label commitment, the same request would give `salt'` = `0xafcf26f7ca1397d9a69cc770e1715c16f2b2d667557f448241e9e81b60aec866` and the address `0xdBFa07f52f8BBD5A5b4C22e379896c2eDA53B44F`.

```
0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000006b49d200000000000000000000000000c80d2a01247ad9e11d1ab45b5ace404b416af0864b7ef6dd50ef7570851a0abfbf121fa35edfcdd5f83d07e6bc275547447ec0040000000000000000000000000000000000000000000000000000000000002105000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000100000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000beef0e0834849acc03f0089f01f4f1eeb06873c9000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000000000000000000000000000000beef0e0834849acc03f0089f01f4f1eeb06873c9000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000446e553f65000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000c80d2a01247ad9e11d1ab45b5ace404b416af08600000000000000000000000000000000000000000000000000000000
```
