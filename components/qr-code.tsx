"use client";

import { useMemo, type ReactNode } from "react";
import { encode } from "uqr";

const INK = "#0b0b0c";

/**
 * A QR code drawn as one SVG path: round dots, rounded finder squares, and a clear square in the
 * middle for `mark`. Error correction is Q (25%), which covers the cleared square with room to spare.
 */
export function QrCode({ value, label, mark }: { value: string; label: string; mark?: ReactNode }) {
  const marked = mark != null;
  const { path, n, hole } = useMemo(() => {
    const qr = encode(value, { ecc: "Q", border: 0 });
    const n = qr.size;
    // Odd, so it centres on the grid: every QR code is an odd number of modules across.
    const hole = marked ? Math.floor(n * 0.22) | 1 : 0;
    const lo = (n - hole) / 2;
    const hi = lo + hole;
    const inFinder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const r = 0.42;
    let path = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!qr.data[y][x] || inFinder(x, y)) continue;
        if (x >= lo && x < hi && y >= lo && y < hi) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        path += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
      }
    }
    return { path, n, hole };
  }, [value, marked]);
  const finders = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const;
  const markSize = hole * 0.78;

  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="geometricPrecision">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} rx={2.4} fill="#ffffff" />
      <path d={path} fill={INK} />
      {finders.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.9} fill="none" stroke={INK} strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={INK} />
        </g>
      ))}
      {hole > 0 && (
        <svg x={(n - markSize) / 2} y={(n - markSize) / 2} width={markSize} height={markSize}>
          {mark}
        </svg>
      )}
    </svg>
  );
}
