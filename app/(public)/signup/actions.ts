// wall-allow: signup provisions a tenant + practitioner; writes no client data

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signUpPractitioner } from "@/lib/signup";
import { getBaseUrl } from "@/lib/base-url";

// C23-SIGNUP §4 — the front door's ONE write path. Everything consequential is
// decided server-side in lib/signup.ts; this file's whole job is to read the
// form, rate-limit the caller, and turn a result into a screen.
//
// This endpoint CREATES TENANTS. It is treated as abusable because it is:
// honeypot + time-trap (the C18 booking precedent) plus a sliding-window cap on
// BOTH the IP and the email.

const IP_HITS = new Map<string, number[]>();
const EMAIL_HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_IP = 5;
const MAX_PER_EMAIL = 3;

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
  redirect(`/signup?${qs.toString()}`);
}

export async function submitSignup(formData: FormData): Promise<void> {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  const lang = String(formData.get("lang") ?? "en") === "es" ? "es" : "en";
  const name = String(formData.get("name") ?? "").trim();
  const practiceName = String(formData.get("practiceName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const slug = String(formData.get("slug") ?? "").trim();
  const ref = String(formData.get("ref") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  // Fields worth re-filling on a refusal. NEVER the password.
  const keep = { name, practiceName, email, slug, ...(ref ? { ref } : {}) };

  // Anti-abuse, before any work: a honeypot a human never fills, a time-trap a
  // bot trips by submitting instantly.
  const honeypot = String(formData.get("company") ?? "");
  const renderedAt = Number(formData.get("t") ?? 0);
  if (honeypot.trim() !== "") back(lang, "rate", {}); // silently dead-end the bot
  if (renderedAt && Date.now() - renderedAt < 1500) back(lang, "rate", keep);

  // Every ATTEMPT counts, valid or not — that is what makes it a rate limit.
  if (tripped(IP_HITS, ip, MAX_PER_IP)) back(lang, "rate", keep);
  if (email && tripped(EMAIL_HITS, email.toLowerCase(), MAX_PER_EMAIL)) back(lang, "rate", keep);

  const result = await signUpPractitioner({
    name,
    practiceName,
    email,
    password,
    slug,
    referredByCode: ref || null,
    source: source || "web",
    locale: lang,
    baseUrl: getBaseUrl(),
  });

  if (!result.ok) back(lang, result.reason, keep);

  const qs = new URLSearchParams({ slug: result.slug, email: result.email, code: result.referralCode });
  if (lang === "es") qs.set("lang", "es");
  redirect(`/signup/welcome?${qs.toString()}`);
}
