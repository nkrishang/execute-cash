"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Position, Vault } from "@/lib/switch";
import { percent, points, shares, usd } from "./format";

/*
 * Choosing a vault, the way a swap chooses a token: a button showing the one chosen, opening a list
 * to search. Where to switch from lists the destination's own vaults first, when it has any; where to
 * switch to lists the vaults with the same asset, by APY, each against the one being left.
 */

/** A vault's image (its own or its curator's), its asset's logo in the corner; its initial when it has none. */
export function VaultMark({ vault }: { vault: Vault }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className="sw-vmark" aria-hidden="true">
      {vault.image && broken !== vault.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vault.image} alt="" onError={() => setBroken(vault.image)} />
      ) : (
        <span className="sw-vmark-letter">{vault.name[0]}</span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {vault.asset.logo && <img className="sw-vmark-asset" src={vault.asset.logo} alt="" />}
    </span>
  );
}

const Chevron = () => (
  <svg className="sw-chevron" viewBox="0 0 16 16" aria-hidden="true">
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The vault's share token, as a transfer's token picker shows a token: its mark and symbol. */
export function VaultButton({ vault, label, onOpen }: { vault: Vault | null; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="sw-vbutton"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={vault ? `${label}: ${vault.name}, ${vault.symbol}. Change` : `${label}: pick a vault`}
    >
      {vault ? (
        <>
          <VaultMark vault={vault} />
          <span className="sw-vbutton-name">{vault.symbol}</span>
        </>
      ) : (
        <span className="sw-vbutton-name">Pick a vault</span>
      )}
      <Chevron />
    </button>
  );
}

/** A vault in the list: what the wallet holds of it, and why it can't be picked, if it can't. */
export type Row = { vault: Vault; held: Position | null; unavailable: string | null };
export type Section = { title: string | null; rows: Row[] };

const matches = (v: Vault, q: string) => [v.name, v.symbol, v.curator ?? "", v.asset.symbol].some((s) => s.toLowerCase().includes(q));


export function VaultPicker({
  open,
  title,
  sections,
  selected,
  against,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  sections: Section[];
  selected: string | null;
  /** The APY each row is compared with, when picking where to switch to. */
  against: number | null;
  onPick: (vault: Vault) => void;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = sections.map((s) => ({ ...s, rows: q ? s.rows.filter((r) => matches(r.vault, q)) : s.rows })).filter((s) => s.rows.length > 0);

  // Up and down move between the rows, and from the search field into them.
  const move = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>("button.sw-row:not(:disabled)") ?? [])];
    if (rows.length === 0) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? (e.key === "ArrowDown" ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
    rows[next].focus();
  };

  return (
    <dialog
      ref={dialog}
      className="sw-dialog"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sw-dialog-body">
        <div className="sw-dialog-head">
          <h2 id={`${id}-title`} className="sw-dialog-title">
            {title}
          </h2>
          <button type="button" className="sw-dialog-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <input
          className="input sw-search"
          placeholder="Search by name, curator or asset"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={move}
          aria-label="Search vaults"
          autoComplete="off"
          spellCheck={false}
        />
        <div ref={list} className="sw-list" onKeyDown={move}>
          {shown.length === 0 && <p className="sw-list-empty">No vault matches “{query.trim()}”.</p>}
          {shown.map((s) => (
            <div key={s.title ?? "all"} role="group" aria-label={s.title ?? "Vaults"}>
              {s.title && <p className="sw-list-title">{s.title}</p>}
              {s.rows.map((r) => (
                <button
                  key={r.vault.address}
                  type="button"
                  className="sw-row"
                  aria-current={selected === r.vault.address ? "true" : undefined}
                  disabled={r.unavailable !== null}
                  onClick={() => onPick(r.vault)}
                >
                  <VaultMark vault={r.vault} />
                  <span className="sw-row-text">
                    <span className="sw-row-name">{r.vault.name}</span>
                    <span className="sw-row-sub">
                      {[r.vault.symbol, r.vault.curator, `${usd(r.vault.depositsUsd)} deposits`].filter(Boolean).join(" · ")}
                    </span>
                    {r.held && (
                      <span className="sw-row-held">
                        Holds {shares(r.held.shares)} {r.vault.symbol}
                      </span>
                    )}
                    {r.unavailable && <span className="sw-row-warn">{r.unavailable}</span>}
                  </span>
                  <span className="sw-row-apy">
                    {percent(r.vault.apy)}
                    {against !== null && <span className="sw-row-delta">{points(r.vault.apy - against)}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
