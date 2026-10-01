// wall-allow: capture writes only the platform prospect ledger; no client data

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { captureProspect } from "@/lib/prospect-capture";

// C23-CAPTURE §2 — the event floor's ONE write path. Everything consequential
// is decided server-side in lib/prospect-capture.ts; this file reads the form,
// rate-limits the caller, and turns a result into a screen.
//
// Anti-abuse is the C23-SIGNUP shape, deliberately reused: honeypot +
// time-trap + a sliding window on BOTH the IP and the email. HONEST LIMIT,
// identical to signup's: the counters are in-memory PER INSTANCE, so they are
// a speed bump against a single abusive client, not a distributed defence. A
// shared store is a platform decision, not this build's.

const IP_HITS = new Map<string, number[]>();
const EMAIL_HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Higher than signup's caps on purpose: capture is a lead form, and one phone
// on a conference NAT may legitimately be several practitioners in a row.
const MAX_PER_IP = 12;
const MAX_PER_EMAIL = 5;

function tripped(map: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const recent = (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  map.set(key, recent);
  return recent.length > max;
}

function back(lang: string, error: string, keep: Record<string, string>): never {
  const qs = new URLSearchParams({ ...keep, error });
  if (lang === "es") qs.set("lang", "es");
  redirect(`/join?${qs.toString()}`);
}

export async function submitCapture(formData: FormData): Promise<void> {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  const lang = String(formData.get("lang") ?? "en") === "es" ? "es" : "en";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const practiceName = String(formData.get("practiceName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const ref = String(formData.get("ref") ?? "").trim();
  const src = String(formData.get("src") ?? "").trim();

  // Fields worth re-filling on a refusal — nobody retypes a note on a phone.
  const keep: Record<string, string> = { name, email };
  if (phone) keep.phone = phone;
  if (practiceName) keep.practiceName = practiceName;
  if (note) keep.note = note;
  if (ref) keep.ref = ref;
  if (src) keep.src = src;

  const honeypot = String(formData.get("company") ?? "");
  const renderedAt = Number(formData.get("t") ?? 0);
  if (honeypot.trim() !== "") back(lang, "rate", {}); // silently dead-end the bot
  if (renderedAt && Date.now() - renderedAt < 1500) back(lang, "rate", keep);

  // Every ATTEMPT counts, valid or not — that is what makes it a rate limit.
  if (tripped(IP_HITS, ip, MAX_PER_IP)) back(lang, "rate", keep);
  if (email && tripped(EMAIL_HITS, email.toLowerCase(), MAX_PER_EMAIL)) back(lang, "rate", keep);

  const result = await captureProspect({
    name,
    email,
    phone: phone || null,
    practiceName: practiceName || null,
    note: note || null,
    source: src || null,
    referredByCode: ref || null,
    // C23-ENGAGE §1 — the language of the screen they filled in, recorded on
    // the prospect so follow-up honours it (law #7).
    locale: lang,
  });

  if (!result.ok) back(lang, result.reason, keep);

  const qs = new URLSearchParams({ code: result.referralCode });
  if (lang === "es") qs.set("lang", "es");
  redirect(`/join/thanks?${qs.toString()}`);
}
