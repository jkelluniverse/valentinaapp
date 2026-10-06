// AMD-05 B2 — a small shared rate limiter for mutating account endpoints.
// In-memory sliding window, per app instance (same posture as the public
// booking limiter): honest protection against scripted abuse without new
// infrastructure. Logs metadata only — keys, never values.

const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const stamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= max) {
    hits.set(key, stamps);
    return true;
  }
  stamps.push(now);
  hits.set(key, stamps);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return false;
}
