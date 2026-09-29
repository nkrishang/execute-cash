/** Wire types of the Execute API (execute-server). */

export type Hex = `0x${string}`;

/** An argument in its JSON form: strings for addresses, integers and bytes; arrays for arrays and tuples. */
export type ArgJson = string | boolean | ArgJson[];

export interface CallJson {
  target: string;
  /** Canonical signature with parameter names: `deposit(uint256 assets, address receiver)`. */
  function: string;
  args: ArgJson[];
}

/** An execution intent, fields in `PaymentFactory.paymentAddress`'s order. */
export interface IntentJson {
  token: string;
  /** Base units, base-10 string. */
  amount: string;
  calls: CallJson[];
  /** Unix seconds. */
  expirationTimestamp: number;
  recovery: string;
  salt: string;
  chainId: number;
}

/** What `POST /v1/address/create` and `GET /v1/address/{address}` serve. */
export interface ExecutableAddress {
  address: string;
  factory: string;
  intent: IntentJson;
  /** The calldata arguments of `PaymentFactory.execute` / `paymentAddress`. */
  terms: string;
}

export interface Revert {
  kind: "decoded" | "empty" | "unrecognised";
  data: string;
  selector?: string;
  name?: string;
  signature?: string;
  args?: Record<string, string>;
  call?: { index: number; target: string };
  reason?: Revert;
}

/** Where the money is. */
export type Status =
  | { state: "awaiting_funds"; balance: string }
  | { state: "funded"; balance: string }
  | { state: "failing"; balance: string; message: string; revert: Revert }
  | { state: "settled"; transactionHash: string; blockNumber: number }
  | { state: "refunding"; balance: string }
  | { state: "refunded"; transactionHash: string; blockNumber: number; amount: string }
  | { state: "expired"; balance: string };

export type StatusView = Status & { address: string; updatedAt: string };

export type AddressState = Status["state"];

export interface ChainToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface Chain {
  chainId: number;
  name: string;
  tokens: ChainToken[];
}

export interface ChainList {
  factory: string;
  chains: Chain[];
}

export interface ApiKeyInfo {
  prefix: string;
  createdAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
}

export interface Account {
  id: string;
  apiKey: ApiKeyInfo | null;
  clientId: string;
  allowedOrigins: string[];
  webhookUrl: string | null;
  webhookSecret: string;
  createdAt: string;
}

export interface IssuedKey {
  /** Shown exactly once. */
  apiKey: string;
  prefix: string;
  createdAt: string;
  rotatedAt: string | null;
}

export interface AddressItem {
  address: string;
  chainId: number;
  token: string;
  amount: string;
  expirationTimestamp: number;
  functions: string[];
  createdAt: string;
  status: StatusView;
}

export interface AddressPage {
  items: AddressItem[];
  nextCursor: string | null;
}

export interface Issue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; issues: Issue[] };
}
