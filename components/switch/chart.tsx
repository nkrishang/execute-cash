"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { History } from "@/lib/switch";
import { day, percent } from "./format";

/*
 * Two vaults' daily net APY over the last 30 days, the vault being switched into emphasised: its
 * line in the accent, the other in grey (validated as a pair: CVD ΔE 15.9, normal vision 17.8). Named
 * by the legend above and by the value at each line's end; a crosshair reads any day, by pointer or
 * by arrow keys, and a table under it carries every value for screen readers.
 */

export type Line = { tone: "from" | "to"; name: string; points: History };

const COLORS = { from: "#898781", to: "#2a78d6" } as const;

/** Tick steps, as fractions: 0.05% up to 100%. */
const STEPS = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1];

function yScale(values: number[]) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // A flat line still gets a band around it.
  if (hi - lo < 0.002) {
    lo -= 0.001;
    hi += 0.001;
  }
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? 1;
  const min = lo >= 0 ? Math.max(0, Math.floor(lo / step) * step) : Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step / 1e6; i++) ticks.push(min + i * step);
  const pct = step * 100;
  const decimals = Math.abs(pct - Math.round(pct)) < 1e-9 ? 0 : Math.abs(pct * 10 - Math.round(pct * 10)) < 1e-9 ? 1 : 2;
  return { min, max, ticks, decimals };
}

const M = { top: 10, right: 58, bottom: 26, left: 44 };

export function ApyChart({ lines, loading }: { lines: Line[]; loading: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawn = useMemo(() => lines.filter((l) => l.points.length > 1), [lines]);
  const height = width > 0 && width < 420 ? 184 : 216;

  const layout = useMemo(() => {
    if (width === 0 || drawn.length === 0) return null;
    const days = [...new Set(drawn.flatMap((l) => l.points.map((p) => p[0])))].sort((a, b) => a - b);
    const y = yScale(drawn.flatMap((l) => l.points.map((p) => p[1])));
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const t0 = days[0];
    const t1 = days[days.length - 1];
    const px = (t: number) => M.left + (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
    const py = (v: number) => M.top + h - ((v - y.min) / (y.max - y.min)) * h;
    const byDay = drawn.map((l) => new Map(l.points));
    const paths = drawn.map((l) => l.points.map((p, i) => `${i ? "L" : "M"}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`).join(""));

    // Each line's last value at its end, pushed apart when the two would overlap.
    const ends = drawn.map((l) => {
      const [t, v] = l.points[l.points.length - 1];
      return { x: px(t), y: py(v), label: py(v), value: v };
    });
    if (ends.length === 2 && Math.abs(ends[0].label - ends[1].label) < 15) {
      const mid = (ends[0].label + ends[1].label) / 2;
      const up = ends[0].label <= ends[1].label ? 0 : 1;
      ends[up].label = mid - 7.5;
      ends[1 - up].label = mid + 7.5;
    }

    const labelDays = width < 420 ? [days[0], days[days.length - 1]] : [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]];
    return { days, y, px, py, w, h, byDay, paths, ends, labelDays };
  }, [width, height, drawn]);

  const move = (e: PointerEvent<SVGRectElement>) => {
    if (!layout) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left + M.left;
    let best = 0;
    for (let i = 1; i < layout.days.length; i++) if (Math.abs(layout.px(layout.days[i]) - x) < Math.abs(layout.px(layout.days[best]) - x)) best = i;
    setAt(best);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!layout) return;
    const last = layout.days.length - 1;
    const next =
      e.key === "ArrowLeft" ? Math.max(0, (at ?? last + 1) - 1) : e.key === "ArrowRight" ? Math.min(last, (at ?? -1) + 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (e.key === "Escape") setAt(null);
    if (next === null) return;
    e.preventDefault();
    setAt(next);
  };

  const t = layout && at !== null ? layout.days[at] : null;
  const tipX = layout && t !== null ? layout.px(t) : 0;
  const readings = layout && t !== null ? drawn.map((l, i) => ({ line: l, value: layout.byDay[i].get(t) })) : [];
  const said = t !== null ? `${day(t)}: ${readings.map((r) => `${r.line.name} ${r.value === undefined ? "no data" : percent(r.value)}`).join(", ")}` : "";
  const missing = lines.filter((l) => l.points.length <= 1);

  return (
    <figure className="sw-chart">
      <figcaption className="sw-chart-head">
        <span className="sw-chart-title">Net APY, daily</span>
        <span className="sw-keys">
          {lines.map((l) => (
            <span key={l.tone} className="sw-key">
              <i style={{ background: COLORS[l.tone] }} aria-hidden="true" />
              {l.name}
            </span>
          ))}
        </span>
      </figcaption>

      <div
        ref={box}
        className="sw-plot"
        style={{ height }}
        tabIndex={layout ? 0 : -1}
        role="group"
        aria-label={`Daily net APY for the last 30 days: ${lines.map((l) => l.name).join(" and ")}. Use the arrow keys to read a day.`}
        aria-describedby={`${id}-table`}
        onKeyDown={key}
        onBlur={() => setAt(null)}
      >
        {layout ? (
          <svg width={width} height={height} aria-hidden="true">
            {layout.y.ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + layout.w} y1={layout.py(v)} y2={layout.py(v)} className="sw-grid" />
                <text x={M.left - 8} y={layout.py(v)} dy="0.32em" textAnchor="end" className="sw-tick">
                  {(v * 100).toFixed(layout.y.decimals)}%
                </text>
              </g>
            ))}
            {layout.labelDays.map((d, i) => (
              <text
                key={d}
                x={layout.px(d)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === layout.labelDays.length - 1 ? "end" : "middle"}
                className="sw-tick"
              >
                {day(d)}
              </text>
            ))}

            {drawn.map((l, i) => (
              <path key={l.tone} d={layout.paths[i]} fill="none" stroke={COLORS[l.tone]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {drawn.map((l, i) => (
              <g key={l.tone}>
                <circle cx={layout.ends[i].x} cy={layout.ends[i].y} r={3} fill={COLORS[l.tone]} stroke="#ffffff" strokeWidth={2} />
                <text x={M.left + layout.w + 8} y={layout.ends[i].label} dy="0.32em" className="sw-end" data-tone={l.tone}>
                  {percent(layout.ends[i].value)}
                </text>
              </g>
            ))}

            {t !== null && (
              <g>
                <line x1={tipX} x2={tipX} y1={M.top} y2={M.top + layout.h} className="sw-cross" />
                {readings.map(
                  (r) =>
                    r.value !== undefined && (
                      <circle key={r.line.tone} cx={tipX} cy={layout.py(r.value)} r={4} fill={COLORS[r.line.tone]} stroke="#ffffff" strokeWidth={2} />
                    ),
                )}
              </g>
            )}

            <rect
              x={M.left}
              y={0}
              width={layout.w}
              height={height}
              fill="transparent"
              style={{ touchAction: "pan-y" }}
              onPointerMove={move}
              onPointerDown={move}
              onPointerLeave={() => setAt(null)}
            />
          </svg>
        ) : (
          width > 0 && <p className="sw-chart-empty">{loading ? "Reading Morpho’s history…" : "No APY history for these vaults yet."}</p>
        )}

        {layout && t !== null && (
          <div className="sw-tip" style={tipX > width - 190 ? { right: width - tipX + 12 } : { left: tipX + 12 }} aria-hidden="true">
            <p className="sw-tip-day">{day(t)}</p>
            {readings.map((r) => (
              <p key={r.line.tone} className="sw-tip-row">
                <i style={{ background: COLORS[r.line.tone] }} />
                <span className="sw-tip-name">{r.line.name}</span>
                <span className="sw-tip-value">{r.value === undefined ? "—" : percent(r.value)}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {!loading && missing.length > 0 && drawn.length > 0 && (
        <p className="sw-chart-note">{missing.map((l) => l.name).join(" and ")} has no history yet.</p>
      )}

      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <table id={`${id}-table`} className="sr-only">
        <caption>Daily net APY, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {lines.map((l) => (
              <th key={l.tone} scope="col">
                {l.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(layout?.days ?? []).map((d) => (
            <tr key={d}>
              <th scope="row">{day(d)}</th>
              {lines.map((l) => {
                const v = l.points.find((p) => p[0] === d)?.[1];
                return <td key={l.tone}>{v === undefined ? "—" : percent(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
