"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLogout, usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyButton } from "@/components/copy-button";
import { StatusChip } from "@/components/status-chip";
import { describeError, ExecuteApiError } from "@/lib/execute/client";
import { DashboardClientProvider, useAccount, useAccountMutation, useAddresses, useIssueKey } from "@/lib/execute/hooks";
import { chainName, formatAmount, formatMinute, short, tokenOf } from "@/lib/execute/format";
import type { Account, ChainList, IssuedKey } from "@/lib/execute/types";
import { Problem, useProblemsShown } from "@/components/field-problem";
import { checkOrigin, checkWebhookUrl } from "@/lib/execute/validate";
import { DOCS } from "@/lib/links";
import { AppNav } from "./app-nav";
import { useSession, useSignInStalled } from "./providers";

/**
 * The developer dashboard: the guide, then one card per thing an account holds (its secret API key
 * for servers, its publishable client ID for web pages, its webhook), then what it has created.
 * The cards hold values and actions only; how to use each is in the docs they link to.
 */
export function Dashboard() {
  const { configured, ready, authenticated, email } = useSession();
  const stalled = useSignInStalled();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (leaving) return;
    if (!configured || (ready && !authenticated)) router.replace("/login?next=/dashboard");
  }, [configured, ready, authenticated, leaving, router]);

  if (!configured || !ready || (!authenticated && !leaving)) {
    return (
      <div className="dash-wait">
        {stalled ? (
          <p className="dash-stalled">
            Sign-in isn’t responding.
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        ) : (
          "Loading your workspace…"
        )}
      </div>
    );
  }
  return (
    <PrivyClient>
      <SignedIn email={email} onLeave={() => setLeaving(true)} />
    </PrivyClient>
  );
}

/** The API client, signed with the Privy session. */
function PrivyClient({ children }: { children: ReactNode }) {
  const { getAccessToken } = usePrivy();
  return <DashboardClientProvider getToken={getAccessToken}>{children}</DashboardClientProvider>;
}

function SignedIn({ email, onLeave }: { email: string | null; onLeave: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { logout } = useLogout({
    onSuccess: () => {
      qc.clear();
      router.replace("/");
    },
  });
  return (
    <DashboardView
      email={email}
      onSignOut={() => {
        onLeave();
        void logout();
      }}
    />
  );
}

/** The dashboard itself; needs a `DashboardClientProvider` above it. */
export function DashboardView({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const account = useAccount();
  return (
    <>
      <AppNav email={email} onSignOut={onSignOut} />
      <main className="dash">
        <div className="verify-cta-row dash-guide">
          <a className="verify-cta" href={DOCS.quickstart} target="_blank" rel="noopener noreferrer">
            <span className="verify-cta-text">
              Read how to set up and use <mark>Execute API</mark>
            </span>
            <span className="verify-cta-arrow" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
        </div>

        {account.isPending && [0, 1, 2].map((i) => <div key={i} className="card card-skeleton" aria-hidden="true" />)}
        {account.isError && (
          <div className="card">
            <p className="card-error">{describeError(account.error)}</p>
          </div>
        )}
        {account.data && (
          <>
            <ApiKeyCard account={account.data} />
            <ClientIdCard account={account.data} />
            <WebhooksCard account={account.data} />
            <AddressesCard />
          </>
        )}
      </main>
    </>
  );
}

// ---- Parts of a card --------------------------------------------------------------------------------

/** A card: what it holds, and a link to the docs on using it. */
function Card({ id, title, docs, docsLabel, children }: { id: string; title: string; docs: string; docsLabel: string; children: ReactNode }) {
  return (
    <section className="card" aria-labelledby={id}>
      <header className="card-head">
        <h2 id={id} className="card-title">
          {title}
        </h2>
        <a className="card-docs" href={docs} target="_blank" rel="noopener noreferrer">
          {docsLabel}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </header>
      {children}
    </section>
  );
}

/** A labelled part of a card; parts after the first sit under a hairline. */
function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card-part">
      <h3 className="card-label">{label}</h3>
      {children}
    </div>
  );
}

/** An API timestamp, to the minute. */
const minute = (iso: string) => formatMinute(Date.parse(iso) / 1000);

function ErrorNote({ error }: { error: unknown }) {
  return <p className="card-error">{describeError(error)}</p>;
}

/** The API's messages start lowercase; shown on their own, they read as sentences. */
const sentence = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** A destructive action that asks once, in place (no browser dialogs). */
function Confirming({ label, warning, onConfirm, busy }: { label: string; warning: string; onConfirm: () => void; busy: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <span className="confirm-text">{warning}</span>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={busy}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {label}
      </button>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

// ---- API key ----------------------------------------------------------------------------------------

function ApiKeyCard({ account }: { account: Account }) {
  const create = useIssueKey("create");
  const rotate = useIssueKey("rotate");
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const busy = create.isPending || rotate.isPending;
  const error = create.error ?? rotate.error;
  const key = account.apiKey;

  return (
    <Card id="api-key" title="API key" docs={DOCS.apiKey} docsLabel="Using API Key">
      {issued ? (
        <>
          <div className="well" data-secret="">
            <code className="well-value">{issued.apiKey}</code>
            <span className="well-actions">
              <CopyButton value={issued.apiKey} className="btn btn-quiet btn-sm" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setIssued(null)}>
                Done
              </button>
            </span>
          </div>
          <p className="card-note">Copy it now. It won’t be shown again.</p>
        </>
      ) : key ? (
        <>
          <div className="well">
            <code className="well-value">
              {key.prefix}
              <span className="well-mask">••••••••••••••••</span>
            </code>
            <span className="well-actions">
              <Confirming label="Rotate" warning="The current key stops working at once." busy={busy} onConfirm={() => rotate.mutate(undefined, { onSuccess: setIssued })} />
            </span>
          </div>
          <p className="card-note">
            Created {minute(key.rotatedAt ?? key.createdAt)} · {key.lastUsedAt ? `last used ${minute(key.lastUsedAt)}` : "never used"}
          </p>
        </>
      ) : (
        <div className="well">
          <span className="well-value well-empty">No key yet</span>
          <span className="well-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => create.mutate(undefined, { onSuccess: setIssued })}>
              {busy ? "Creating…" : "Create API key"}
            </button>
          </span>
        </div>
      )}
      {error && <ErrorNote error={error} />}
    </Card>
  );
}

// ---- Client ID --------------------------------------------------------------------------------------

function ClientIdCard({ account }: { account: Account }) {
  const rotate = useAccountMutation<void>((api) => api.rotateClientId());
  return (
    <Card id="client-id" title="Client ID" docs={DOCS.clientId} docsLabel="Using Client ID">
      <div className="well">
        <code className="well-value">{account.clientId}</code>
        <span className="well-actions">
          <CopyButton value={account.clientId} className="btn btn-quiet btn-sm" />
          <Confirming label="Rotate" warning="Pages using this ID stop working." busy={rotate.isPending} onConfirm={() => rotate.mutate()} />
        </span>
      </div>
      {rotate.error && <ErrorNote error={rotate.error} />}
      <Origins key={account.allowedOrigins.join(",")} saved={account.allowedOrigins} />
    </Card>
  );
}

function Origins({ saved }: { saved: string[] }) {
  const [origins, setOrigins] = useState(saved);
  const [draft, setDraft] = useState("");
  const [shown, show] = useProblemsShown(draft);
  const save = useAccountMutation<string[]>((api, list) => api.setAllowedOrigins(list));
  const changed = origins.join("\n") !== saved.join("\n");
  const issues = save.error instanceof ExecuteApiError ? save.error.issues : [];
  const issueFor = (i: number) => {
    const message = issues.find((x) => x.path === `/allowedOrigins/${i}`)?.message;
    return message && sentence(message);
  };
  const listIssue = issues.find((x) => x.path === "/allowedOrigins")?.message;

  const check = checkOrigin(draft, origins);
  const problem = shown && !check.ok ? check : null;

  /** Adds an entry that passes the checks; one that doesn't stays in the field, saying why. */
  const add = (entry: string) => {
    const c = checkOrigin(entry, origins);
    if (!c.ok) {
      setDraft(entry);
      show();
      return;
    }
    setOrigins([...origins, c.value]);
    setDraft("");
    save.reset();
  };

  return (
    <Part label="Allowed origins">
      {origins.length > 0 && (
        <ul className="origins">
          {origins.map((o, i) => (
            <li key={o} className="origin" data-issue={issueFor(i) ? "" : undefined}>
              <code>{o}</code>
              {issueFor(i) && <span className="origin-issue">{issueFor(i)}</span>}
              <button
                type="button"
                className="origin-remove"
                aria-label={`Remove ${o}`}
                onClick={() => {
                  setOrigins(origins.filter((x) => x !== o));
                  save.reset();
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="field"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <input
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://app.example.com"
          aria-label="Origin to allow"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "origin-problem" : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={show}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-quiet" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {problem && <Problem id="origin-problem" message={problem.message} fix={problem.fix} onFix={add} />}
      {changed && (
        <div className="savebar">
          <span>Unsaved changes to allowed origins</span>
          <span className="savebar-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOrigins(saved)}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(origins)}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
      {listIssue && <Problem id="origins-problem" message={sentence(listIssue)} />}
      {save.error && issues.length === 0 && <ErrorNote error={save.error} />}
    </Part>
  );
}

// ---- Webhooks ---------------------------------------------------------------------------------------

function WebhooksCard({ account }: { account: Account }) {
  const url = account.webhookUrl;
  const [draft, setDraft] = useState(url ?? "");
  const [shown, show] = useProblemsShown(draft);
  const [justSaved, setJustSaved] = useState(false);
  const [reveal, setReveal] = useState(false);
  const save = useAccountMutation<string>((api, value) => api.setWebhookUrl(value));
  const remove = useAccountMutation<void>((api) => api.deleteWebhookUrl());
  const rotate = useAccountMutation<void>((api) => api.rotateWebhookSecret());
  const secret = account.webhookSecret;

  // The field follows the saved endpoint: after a save, a removal, or a change elsewhere.
  useEffect(() => setDraft(url ?? ""), [url]);

  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [justSaved]);

  const check = checkWebhookUrl(draft);
  const unchanged = draft.trim() === (url ?? "");
  const serverIssue = save.error instanceof ExecuteApiError ? save.error.issues.find((i) => i.path === "/webhookUrl")?.message : undefined;
  const problem = shown && !check.ok && !unchanged ? check : serverIssue ? { message: sentence(serverIssue) } : null;
  const otherError = serverIssue ? remove.error : (save.error ?? remove.error);

  const submit = (value: string) => {
    const c = checkWebhookUrl(value);
    if (!c.ok) {
      setDraft(value);
      show();
      return;
    }
    if (c.value === (url ?? "")) return;
    save.mutate(c.value, { onSuccess: () => setJustSaved(true) });
  };

  return (
    <Card id="webhooks" title="Webhooks" docs={DOCS.webhooks} docsLabel="Using webhooks">
      <Part label="Endpoint">
        <form
          className="field"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://api.example.com/hooks/execute"
            aria-label="Webhook endpoint"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "webhook-problem" : undefined}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              save.reset();
            }}
            onBlur={() => !unchanged && show()}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !draft.trim() || unchanged}>
            {save.isPending ? "Saving…" : justSaved && unchanged ? "Saved" : "Save"}
          </button>
          {url && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={remove.isPending}
              onClick={() => {
                save.reset();
                remove.mutate();
              }}
            >
              Remove
            </button>
          )}
        </form>
        {problem && (
          <Problem
            id="webhook-problem"
            message={problem.message}
            fix={"fix" in problem ? problem.fix : undefined}
            onFix={(fix) => {
              setDraft(fix);
              save.reset();
            }}
          />
        )}
        {otherError && <ErrorNote error={otherError} />}
      </Part>

      <Part label="Signing secret">
        <div className="well">
          <code className="well-value">
            {reveal ? (
              secret
            ) : (
              <>
                {secret.slice(0, 10)}
                <span className="well-mask">••••••••••••••••</span>
              </>
            )}
          </code>
          <span className="well-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setReveal(!reveal)}>
              {reveal ? "Hide" : "Reveal"}
            </button>
            <CopyButton value={secret} className="btn btn-quiet btn-sm" />
            <Confirming label="Rotate" warning="Deliveries switch to the new secret at once." busy={rotate.isPending} onConfirm={() => rotate.mutate()} />
          </span>
        </div>
        {rotate.error && <ErrorNote error={rotate.error} />}
      </Part>
    </Card>
  );
}

// ---- Addresses --------------------------------------------------------------------------------------

function useChains() {
  return useQuery({
    queryKey: ["chains"],
    queryFn: async () => (await fetch("/api/execute/chains").then((r) => r.json())) as ChainList,
    staleTime: 60 * 60 * 1000,
  });
}

function AddressesCard() {
  const addresses = useAddresses();
  const chains = useChains();
  const items = addresses.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card id="addresses" title="Addresses" docs={DOCS.createAddress} docsLabel="Creating addresses">
      {addresses.isPending && <div className="card-skeleton card-skeleton-inline" aria-hidden="true" />}
      {addresses.isError && <ErrorNote error={addresses.error} />}
      {addresses.data && items.length === 0 && <p className="card-empty">No addresses yet</p>}
      {items.length > 0 && (
        <ul className="rows">
          {items.map((item) => {
            const token = tokenOf(chains.data?.chains, item.chainId, item.token);
            return (
              <li key={item.address} className="row">
                <StatusChip state={item.status.state} />
                <Link href={`/address/${item.address}`} className="row-address">
                  {short(item.address, 6)}
                </Link>
                <span className="row-what">
                  {token ? `${formatAmount(item.amount, token.decimals)} ${token.symbol}` : item.amount}
                  <span className="row-sub">
                    {chainName(item.chainId)} · {item.functions.map((f) => f.slice(0, f.indexOf("("))).join(" → ")}
                  </span>
                </span>
                <span className="row-time">{minute(item.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {addresses.hasNextPage && (
        <button type="button" className="btn btn-quiet rows-more" disabled={addresses.isFetchingNextPage} onClick={() => addresses.fetchNextPage()}>
          {addresses.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </Card>
  );
}
