import type { Account, AddressPage, ApiErrorBody, IssuedKey, Issue } from "./types";

/** Any non-2xx answer from the API (through the /api/execute proxy). */
export class ExecuteApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: Issue[];

  constructor(status: number, code: string, message: string, issues: Issue[]) {
    super(message);
    this.name = "ExecuteApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export type TokenGetter = () => Promise<string | null>;

async function request<T>(getToken: TokenGetter, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new ExecuteApiError(401, "no_session", "You are signed out. Sign in again to continue.", []);
  const res = await fetch(`/api/execute/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ExecuteApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? (text || res.statusText), err?.issues ?? []);
  }
  return json as T;
}

/** The dashboard's view of the API: the signed-in account and what it created. */
export function createDashboardClient(getToken: TokenGetter) {
  return {
    account: () => request<Account>(getToken, "GET", "account"),
    createKey: () => request<IssuedKey>(getToken, "POST", "account/api-key"),
    rotateKey: () => request<IssuedKey>(getToken, "POST", "account/api-key/rotate"),
    rotateClientId: () => request<Account>(getToken, "POST", "account/client-id/rotate"),
    setAllowedOrigins: (allowedOrigins: string[]) => request<Account>(getToken, "PUT", "account/allowed-origins", { allowedOrigins }),
    setWebhookUrl: (webhookUrl: string) => request<Account>(getToken, "PUT", "account/webhook-url", { webhookUrl }),
    deleteWebhookUrl: () => request<Account>(getToken, "DELETE", "account/webhook-url"),
    rotateWebhookSecret: () => request<Account>(getToken, "POST", "account/webhook-secret/rotate"),
    addresses: (cursor: string | null) =>
      request<AddressPage>(getToken, "GET", `account/addresses?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  };
}

export type DashboardClient = ReturnType<typeof createDashboardClient>;

export function describeError(error: unknown): string {
  if (error instanceof ExecuteApiError) {
    if (error.code === "unavailable" && error.status === 503 && error.message.includes("sign-in")) {
      return "Sign-in verification is not configured on the API yet.";
    }
    return error.issues.length > 0 ? error.issues.map((i) => i.message).join(" · ") : error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
