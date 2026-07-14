"use server";

// wall-allow: the narrow discovery-booking action (C18 §2/§4). Reaches ONLY
// Lead + Appointment creation via lib/discovery — never client data. This is the
// single sanctioned write path from the public surface.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { bookDiscoveryCall } from "@/lib/discovery";
import { getBaseUrl } from "@/lib/base-url";

// Simple per-IP sliding-window rate limit. In-memory (per instance) — enough for
// a calm site; the honeypot + time-trap carry most of the load. Not a fortress.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function submitBooking(formData: FormData): Promise<void> {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Anti-abuse (calm > fortress): a honeypot a human never fills, a time-trap a
  // bot trips by submitting instantly, and a soft per-IP cap.
  const honeypot = String(formData.get("company") ?? ""); // hidden field
  const renderedAt = Number(formData.get("t") ?? 0);
  const elapsed = Date.now() - renderedAt;
  if (honeypot.trim() !== "") redirect("/book/confirmed?ok=1"); // pretend success, drop it
  if (!renderedAt || elapsed < 2500) redirect("/book?error=slow");
  if (rateLimited(ip)) redirect("/book?error=rate");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const startIso = String(formData.get("startAt") ?? "");
  const source = String(formData.get("source") ?? "").trim() || null;

  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !startIso) {
    redirect("/book?error=missing");
  }
  const startAt = new Date(startIso);
  if (Number.isNaN(startAt.getTime())) redirect("/book?error=missing");

  const result = await bookDiscoveryCall({
    name,
    email,
    phone: phone || null,
    note: note || null,
    startAt,
    source,
    baseUrl: getBaseUrl(),
  });

  if (!result.ok) {
    redirect(`/book?error=${result.error === "no_practitioner" ? "unavailable" : result.error}`);
  }
  redirect("/book/confirmed?ok=1");
}
