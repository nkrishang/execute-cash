"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, isAddressEqual, type Address } from "viem";
import { BaseMark } from "@/components/debugger-kit";
import { Problem, useProblemsShown } from "@/components/field-problem";
import { FACTORY, IMPLEMENTATION } from "@/lib/docs";
import { short } from "@/lib/execute/format";
import type { ApiErrorBody, ExecutableAddress } from "@/lib/execute/types";
import { CHAINS, MIN_USD, SHARE_DECIMALS, helpersOf, type ChainId, type Position, type Vault } from "@/lib/switch";
import { Compare } from "./compare";
import { parseAmount, percent, points, shares as shareText } from "./format";
import { Pay, keep, prove, restore, type Made, type Proof } from "./pay";
import { VaultButton, VaultPicker, type Section } from "./picker";

/*
 * /morpho's tool: a switch from one Morpho vault to another, laid out like a token transfer. The
 * shares to send and their vault, the vault to move into, and the destination address that will own
 * the new position; then an executable address (app/api/switch), checked here against what was asked
 * for, paid in the first vault's shares from any wallet that holds them, and followed until the new
 * shares are at the destination. Beside it, what the switch earns.
 */

const ORDER: ChainId[] = [8453, 143, 5042];

type Field<T> = { ok: true; value: T } | { ok: false; message: string; fix?: string };

const NOT_A_DESTINATION = [...ORDER.flatMap(helpersOf), FACTORY, IMPLEMENTATION] as Address[];

function checkDestination(input: string): Field<Address> {
  const value = input.trim();
  if (!value) return { ok: false, message: "Enter the address that will own the new position" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, message: "An address is 0x and 40 hex characters" };
  if (!isAddress(value)) return { ok: false, message: "That address has a bad checksum", fix: getAddress(value.toLowerCase()) };
  if (/^0x0{40}$/.test(value)) return { ok: false, message: "Use an address you control" };
  if (NOT_A_DESTINATION.some((c) => isAddressEqual(c, value))) return { ok: false, message: "That’s a contract a switch calls. Use an address you control" };
  return { ok: true, value: getAddress(value) };
}

/** An amount of a vault's asset in USD, at Morpho's price. */
const worth = (v: Vault, units: bigint | string) => (Number(units) / 10 ** v.asset.decimals) * v.asset.usd;

const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Where to switch from, before anyone picks: the largest USDC vault that can pay out. */
function defaultFrom(vaults: Vault[]): Vault | null {
  const open = vaults.filter((v) => v.from && v.liquidityUsd >= MIN_USD);
  return open.find((v) => v.asset.symbol === "USDC") ?? open[0] ?? null;
}

/** Where to switch to, before anyone picks: the largest vault with the same asset that pays more, else the largest. */
function defaultTo(vaults: Vault[], from: Vault | null): Vault | null {
  if (!from) return null;
  const same = vaults.filter((v) => isAddressEqual(v.asset.address, from.asset.address) && !isAddressEqual(v.address, from.address));
  return same.find((v) => v.apy > from.apy) ?? same[0] ?? null;
}

type Holdings = Partial<Record<ChainId, Position[]>>;
const NONE: Holdings = {};

/**
 * What the destination address already holds, on every chain. Often it's the wallet the shares come
 * from too, so its vaults are listed first, with a Max; nothing here assumes it is.
 */
function useHoldings(destination: Address | null, chains: ChainId[], nonce: number): Holdings {
  const [state, setState] = useState<{ destination: Address; byChain: Holdings } | null>(null);
  useEffect(() => {
    if (!destination) return;
    let gone = false;
    setState({ destination, byChain: {} });
    for (const id of chains) {
      void fetch(`/api/switch/positions?chainId=${id}&wallet=${destination}`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<{ positions: Position[] }>) : null))
        .then((body) => {
          if (body && !gone) setState((s) => (s?.destination === destination ? { destination, byChain: { ...s.byChain, [id]: body.positions } } : s));
        })
        .catch(() => {
          // Without it, the vaults are just not marked.
        });
    }
    return () => {
      gone = true;
    };
  }, [destination, chains, nonce]);
  return state && state.destination === destination ? state.byChain : NONE;
}

type Quote = { shares: bigint; assets: bigint; depositShares: bigint; usd: number };
type Quoted = { status: "idle" } | { status: "loading" } | { status: "ok"; quote: Quote } | { status: "error"; message: string };

/** What the vaults say the shares move, read a moment after the amount stops changing. */
function useQuote(chainId: ChainId, from: Vault | null, to: Vault | null, shares: bigint | null): Quoted {
  const key = from && to && shares ? `chainId=${chainId}&from=${from.address}&to=${to.address}&shares=${shares}` : "";
  const [state, setState] = useState<{ key: string; value: Quoted }>({ key: "", value: { status: "idle" } });
  useEffect(() => {
    if (!key) return;
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/switch/quote?${key}`, { cache: "no-store", signal: abort.signal });
        const body = (await res.json()) as { shares: string; assets: string; depositShares: string; usd: number } | ApiErrorBody;
        if (!res.ok || "error" in body) {
          setState({ key, value: { status: "error", message: "error" in body ? body.error.message : `The quote answered ${res.status}` } });
          return;
        }
        const quote = { shares: BigInt(body.shares), assets: BigInt(body.assets), depositShares: BigInt(body.depositShares), usd: body.usd };
        setState({ key, value: { status: "ok", quote } });
      } catch {
        if (!abort.signal.aborted) setState({ key, value: { status: "error", message: "Couldn’t read the vaults. Try again." } });
      }
    }, 300);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [key]);
  if (!key) return { status: "idle" };
  return state.key === key ? state.value : { status: "loading" };
}

function ChainMark({ chainId }: { chainId: ChainId }) {
  if (chainId === 8453)
    return (
      <span className="sw-chain-mark" data-of="base">
        <BaseMark />
      </span>
    );
  return (
    <span className="sw-chain-mark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={chainId === 143 ? "/chains/monad.svg" : "/chains/arc.svg"} alt="" width={16} height={16} />
    </span>
  );
}

const FlipIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5 2.8v10.4m0 0L2.4 10.6M5 13.2l2.6-2.6M11 13.2V2.8m0 0L8.4 5.4M11 2.8l2.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** How long a figure is, for its size: a whole balance can run to eighteen decimals. */
const length = (text: string) => (text.length > 12 ? "xl" : text.length > 8 ? "l" : undefined);

export function SwitchTool({ vaults }: { vaults: Vault[] }) {
  const chains = useMemo(() => ORDER.filter((id) => vaults.some((v) => v.chainId === id && v.from)), [vaults]);
  const [chainId, setChainId] = useState<ChainId>(chains[0] ?? 8453);
  // What was picked on which chain; unpicked, each side has a default.
  const [picked, setPicked] = useState<{ chainId: ChainId; from: Address | null; to: Address | null }>({ chainId, from: null, to: null });
  const [amount, setAmount] = useState("");
  const [amountShown, showAmount] = useProblemsShown(amount);
  const [destination, setDestination] = useState("");
  const [destinationShown, showDestination] = useProblemsShown(destination);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [nonce, setNonce] = useState(0);

  const d = checkDestination(destination);
  const owner = d.ok ? d.value : null;
  const holdings = useHoldings(owner, chains, nonce);

  const here = useMemo(() => vaults.filter((v) => v.chainId === chainId), [vaults, chainId]);
  const held = useMemo(() => holdings[chainId] ?? [], [holdings, chainId]);
  const find = (address: Address | null) => (address ? (here.find((v) => isAddressEqual(v.address, address)) ?? null) : null);

  const mine = picked.chainId === chainId;
  const from = (mine ? find(picked.from) : null) ?? defaultFrom(here);
  const pickedTo = mine ? find(picked.to) : null;
  const to =
    pickedTo && from && isAddressEqual(pickedTo.asset.address, from.asset.address) && !isAddressEqual(pickedTo.address, from.address)
      ? pickedTo
      : defaultTo(here, from);

  // The amount is in the source vault's shares: exactly what gets sent.
  const units = parseAmount(amount, SHARE_DECIMALS);
  const quoted = useQuote(chainId, from, to, units !== null && units > 0n ? units : null);
  const quote = quoted.status === "ok" ? quoted.quote : null;
  const position = from ? (held.find((p) => isAddressEqual(p.vault, from.address)) ?? null) : null;
  const all = !!position && units === BigInt(position.shares);

  const checkAmount = (): Field<bigint> => {
    if (!from) return { ok: false, message: "Pick a vault to switch from" };
    const value = amount.trim().replace(/,/g, "");
    if (!value) return { ok: false, message: `Enter how many ${from.symbol} to send` };
    if (units === null) {
      return /^\d*\.?\d*$/.test(value) && value !== "."
        ? { ok: false, message: `${from.symbol} has ${SHARE_DECIMALS} decimals` }
        : { ok: false, message: `Enter an amount of ${from.symbol}, like 5 or 2.5` };
    }
    if (units === 0n) return { ok: false, message: "Enter more than 0" };
    if (quote) {
      if (quote.usd < MIN_USD) return { ok: false, message: `Send at least ${money(MIN_USD)} worth` };
      if (quote.usd > from.liquidityUsd) return { ok: false, message: `${from.name} has only ${money(from.liquidityUsd)} to withdraw right now` };
    }
    return { ok: true, value: units };
  };

  const a = checkAmount();
  const amountProblem = amountShown && !a.ok ? a : null;
  const quoteProblem = a.ok && quoted.status === "error" ? quoted.message : null;
  const destinationProblem = destinationShown && !d.ok ? d : null;

  // In the browser, never on the server: the point is not to take anyone's word for it.
  const [proof, setProof] = useState<Proof | null>(null);
  useEffect(() => setProof(made ? prove(made, vaults.find((v) => v.chainId === made.chainId && isAddressEqual(v.address, made.from)) ?? null) : null), [made, vaults]);

  useEffect(() => {
    const saved = restore();
    if (!saved) return;
    setMade(saved);
    setChainId(saved.chainId);
    setDestination(saved.wallet);
    setPicked({ chainId: saved.chainId, from: saved.from, to: saved.to });
  }, []);

  const track = (next: Made | null) => {
    setMade(next);
    keep(next);
  };

  // The amount is in a vault's shares, so it goes whenever that vault does.
  const chooseChain = (id: ChainId) => {
    setChainId(id);
    setAmount("");
    setError(null);
  };

  const pick = (side: "from" | "to", v: Vault) => {
    setPicked((p) => {
      const base = p.chainId === chainId ? p : { chainId, from: null, to: null };
      return side === "from" ? { ...base, from: v.address } : { ...base, from: from?.address ?? null, to: v.address };
    });
    if (side === "from" && (!from || !isAddressEqual(from.address, v.address))) setAmount("");
    setError(null);
    setPicking(null);
  };

  const flip = () => {
    if (!from || !to || !to.from) return;
    setPicked({ chainId, from: to.address, to: from.address });
    setAmount("");
    setError(null);
  };

  const takeMax = () => {
    if (!position) return;
    setAmount(formatUnits(BigInt(position.shares), SHARE_DECIMALS));
    setError(null);
  };

  const create = async () => {
    if (!d.ok || !a.ok || !from || !to || !quote) {
      showAmount();
      showDestination();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, from: from.address, to: to.address, wallet: d.value, shares: quote.shares.toString() }),
      });
      const body = (await res.json()) as ExecutableAddress | ApiErrorBody;
      if (!res.ok || "error" in body) {
        const err = "error" in body ? body.error : null;
        setError(err ? (err.issues[0]?.message ?? err.message) : `The page’s API answered ${res.status}`);
        return;
      }
      track({
        exe: body,
        chainId,
        wallet: d.value,
        from: from.address,
        to: to.address,
        asset: from.asset.address,
        shares: quote.shares,
        assets: quote.assets,
        all,
      });
    } catch {
      setError("Couldn’t reach Execute. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    track(null);
    setAmount("");
    setNonce((n) => n + 1);
  };

  // The panel beside follows the switch being paid, once there is one.
  const madeFrom = made ? (vaults.find((v) => v.chainId === made.chainId && isAddressEqual(v.address, made.from)) ?? null) : null;
  const madeTo = made ? (vaults.find((v) => v.chainId === made.chainId && isAddressEqual(v.address, made.to)) ?? null) : null;
  const amountUsd = made ? (madeFrom ? worth(madeFrom, made.assets) : null) : (quote?.usd ?? null);

  const fromSections: Section[] = useMemo(() => {
    const rows = here.map((v) => {
      const p = held.find((x) => isAddressEqual(x.vault, v.address)) ?? null;
      const unavailable = !v.from ? "Execute doesn’t take its shares yet" : v.liquidityUsd < MIN_USD ? "Nothing to withdraw from it right now" : null;
      return { vault: v, held: p, unavailable };
    });
    const theirs = rows.filter((r) => r.held).sort((x, y) => worth(y.vault, y.held?.assets ?? "0") - worth(x.vault, x.held?.assets ?? "0"));
    const rest = rows.filter((r) => !r.held && r.vault.from);
    return theirs.length && owner ? [{ title: `Held by ${short(owner)}`, rows: theirs }, { title: "All vaults", rows: rest }] : [{ title: null, rows: rest }];
  }, [here, held, owner]);

  const toSections: Section[] = useMemo(() => {
    if (!from) return [];
    const rows = here
      .filter((v) => isAddressEqual(v.asset.address, from.asset.address) && !isAddressEqual(v.address, from.address))
      .sort((x, y) => y.apy - x.apy)
      .map((v) => ({ vault: v, held: held.find((x) => isAddressEqual(x.vault, v.address)) ?? null, unavailable: null }));
    return [{ title: null, rows }];
  }, [here, held, from]);

  if (chains.length === 0) {
    return (
      <div className="sw-tool" data-empty="">
        <div className="sw-card">
          <p className="sw-unavailable">
            {vaults.length === 0
              ? "Morpho’s vault list isn’t answering right now. Try again in a minute."
              : "Execute isn’t taking vault shares yet. Check back soon."}
          </p>
        </div>
      </div>
    );
  }

  const cta = !from
    ? "Pick a vault"
    : !to
      ? "No vault to switch into"
      : !amount.trim()
        ? "Enter an amount"
        : !destination.trim()
          ? "Enter a destination address"
          : creating
            ? "Creating…"
            : "Switch";
  const ready = !!from && !!to && !!amount.trim() && !!destination.trim() && !creating && !(a.ok && quoted.status !== "ok");
  const received = quote ? shareText(quote.depositShares) : quoted.status === "loading" ? "…" : "0";

  return (
    <div className="sw-tool">
      <div className="sw-card">
        {made ? (
          <Pay made={made} from={madeFrom} to={madeTo} proof={proof} onReset={reset} />
        ) : (
          <form
            className="sw-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="sw-chains" role="group" aria-label="Chain">
              {chains.map((id) => (
                <button key={id} type="button" className="sw-chain" aria-pressed={id === chainId} onClick={() => chooseChain(id)}>
                  <ChainMark chainId={id} />
                  {CHAINS[id].name}
                </button>
              ))}
            </div>

            <div className="sw-pair">
              <div className="sw-box">
                <div className="sw-box-top">
                  <label className="sw-box-label" htmlFor="sw-amount">
                    Send
                  </label>
                  {from && position && owner && (
                    <span className="sw-box-held">
                      {short(owner)} holds {shareText(position.shares)}
                      <button type="button" className="sw-max" onClick={takeMax} aria-pressed={all}>
                        Max
                      </button>
                    </span>
                  )}
                </div>
                <div className="sw-box-main">
                  <input
                    id="sw-amount"
                    className="sw-amount"
                    data-long={length(amount)}
                    size={1}
                    placeholder="0"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={amountProblem ? true : undefined}
                    aria-describedby={amountProblem ? "sw-amount-problem" : undefined}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError(null);
                    }}
                    onBlur={showAmount}
                  />
                  <VaultButton vault={from} label="Send shares of" onOpen={() => setPicking("from")} />
                </div>
                <div className="sw-box-foot">
                  <span>{quote ? `≈ ${money(quote.usd)}` : ""}</span>
                  {from && (
                    <span className="sw-box-vault">
                      <span className="sw-box-name">{from.name}</span>
                      <span>· {percent(from.apy)} APY</span>
                    </span>
                  )}
                </div>
              </div>

              <button type="button" className="sw-flip" onClick={flip} disabled={!to?.from} aria-label="Swap the two vaults" title="Swap the two vaults">
                <FlipIcon />
              </button>

              <div className="sw-box" data-side="to">
                <div className="sw-box-top">
                  <span className="sw-box-label">Receive</span>
                </div>
                <div className="sw-box-main">
                  <output className="sw-amount" data-long={length(received)} data-empty={quote ? undefined : ""} aria-live="polite">
                    {received}
                  </output>
                  <VaultButton vault={to} label="Receive shares of" onOpen={() => setPicking("to")} />
                </div>
                <div className="sw-box-foot">
                  <span>{quote ? `≈ ${money(quote.usd)}` : ""}</span>
                  {from && to && (
                    <span className="sw-box-vault">
                      <span className="sw-box-name">{to.name}</span>
                      <span>
                        · {percent(to.apy)} APY <b className="sw-delta">{points(to.apy - from.apy)}</b>
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            {amountProblem ? (
              <Problem id="sw-amount-problem" message={amountProblem.message} />
            ) : (
              quoteProblem && <Problem id="sw-quote-problem" message={quoteProblem} />
            )}

            <label className="bitso-label" htmlFor="sw-destination">
              Destination address
            </label>
            <input
              id="sw-destination"
              className="input sw-destination"
              placeholder="0x…"
              aria-invalid={destinationProblem ? true : undefined}
              aria-describedby={destinationProblem ? "sw-destination-problem" : "sw-destination-note"}
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setError(null);
              }}
              onBlur={showDestination}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
            />
            {destinationProblem ? (
              <Problem id="sw-destination-problem" message={destinationProblem.message} fix={destinationProblem.fix} onFix={setDestination} />
            ) : (
              <p id="sw-destination-note" className="bitso-note">
                This address will own the position you switch to.
              </p>
            )}

            <button type="submit" className="btn btn-primary sw-submit" disabled={!ready}>
              {cta}
            </button>
            {error && <Problem id="sw-error" message={error} />}
            <p className="bitso-note bitso-note-center">Next, send the shares from any wallet that holds them. No wallet connection, no approvals.</p>
          </form>
        )}
      </div>

      <Compare
        from={made ? madeFrom : from}
        to={made ? madeTo : to}
        amountUsd={amountUsd !== null && amountUsd > 0 ? amountUsd : null}
        heldUsd={!made && from && position ? worth(from, position.assets) : null}
      />

      <VaultPicker
        open={picking !== null}
        title={picking === "to" ? "Switch to" : "Switch from"}
        sections={picking === "to" ? toSections : fromSections}
        selected={(picking === "to" ? to?.address : from?.address) ?? null}
        against={picking === "to" && from ? from.apy : null}
        onPick={(v) => pick(picking === "to" ? "to" : "from", v)}
        onClose={() => setPicking(null)}
      />
    </div>
  );
}
