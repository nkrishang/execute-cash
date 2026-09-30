import "server-only";
import type { NextRequest } from "next/server";

/** A budget of requests per visitor a minute, per server instance: a brake, not a guarantee. */
export function perMinute(limit: number) {
  const recent = new Map<string, number[]>();
  return (req: NextRequest) => {
    const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const hits = (recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= limit) return false;
    if (recent.size > 5000) recent.clear();
    recent.set(visitor, [...hits, now]);
    return true;
  };
}
