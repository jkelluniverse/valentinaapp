// wall-allow: the founding application writes only the platform prospect ledger; no client data

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { captureProspect } from "@/lib/prospect-capture";
import { rawPrisma } from "@/lib/prisma-internal";
import { sourceTagFor } from "@/lib/founders-config";
import { CAPS } from "@/lib/capture-config";

// C35-FOUNDERS-EVENT §12 — the founding application's ONE write path.
//
// A2, ANSWERED AND REUSED: this does NOT build a parallel capture mechanism.
// It calls the SAME captureProspect() the event floor has been using since
// C23-CAPTURE, so the upsert-by-email invariants come along unchanged — a
// SIGNED_UP prospect is never downgraded, the first referral code wins, and the
// referral code is issued once. The ten application-only answers that
// PractitionerProspect has no columns for are written afterwards into the
// ADDITIVE `applicationMeta` JSON column (migration 53).
//
// RULING 181 — the card's ?source= maps to the stored tag through
// sourceTagFor(), the SAME function the page uses. Stage 1's defect was two
// sides of a boundary disagreeing about a parameter name (ruling 179); one
// shared function is the structural answer.
//
// RULING 189 — this route does NOT provision anything. No tenant, no portal, no
// Stripe object. A seat is claimed only at successful first payment, which is
// C36's job and happens after a human accepts the application.

const IP_HITS = new Map<string, number[]>();
const EMAIL_HITS = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 12;
const MAX_PER_EMAIL = 5;

function tripped(map: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const recent = (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  map.set(key, recent);
  return recent.length > max;
}

/** The application-only answers, each capped server-side. The form's maxLength
 *  is a courtesy; this is the limit. */
const META_FIELDS = [
  "website", "practitionerType", "modalities", "activeClients",
  "soloOrTeam", "currentTools", "fragmented", "understand", "practiceLanguage",
] as const;
const META_CAP = 600;

function back(error: string, keep: Record<string, string>): never {
  const qs = new URLSearchParams({ ...keep, error });
  redirect(`/founders/apply?${qs.toString()}`);
}

export async function submitApplication(formData: FormData): Promise<void> {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const firstName = get("firstName");
  const lastName = get("lastName");
  const email = get("email");
  const phone = get("phone");
  const practiceName = get("practiceName");
  const rawSource = get("source");
  const feedbackOk = formData.get("feedbackCalls") !== null;
  const consentOk = formData.get("consent") !== null;

  // Re-fillable on a refusal — nobody retypes two paragraphs on a phone.
  const keep: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && v.trim() && k !== "company" && k !== "t") keep[k] = v.trim().slice(0, META_CAP);
  }

  const honeypot = get("company");
  const renderedAt = Number(formData.get("t") ?? 0);
  if (honeypot !== "") back("rate", {}); // silently dead-end the bot
  if (renderedAt && Date.now() - renderedAt < 1500) back("rate", keep);

  if (tripped(IP_HITS, ip, MAX_PER_IP)) back("rate", keep);
  if (email && tripped(EMAIL_HITS, email.toLowerCase(), MAX_PER_EMAIL)) back("rate", keep);

  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!name || !email) back("missing", keep);
  // Both confirmations are REQUIRED by the offer's own terms: founding members
  // agree to three feedback calls (brief §11), and we do not mail people who
  // did not say yes.
  if (!feedbackOk) back("feedback", keep);
  if (!consentOk) back("consent", keep);

  const result = await captureProspect({
    name,
    email,
    phone: phone || null,
    practiceName: practiceName || null,
    note: null,
    // Ruling 181's mapping, from the shared function. null leaves
    // captureProspect's own default alone — this route invents no tags.
    source: sourceTagFor(rawSource),
    referredByCode: get("ref") || null,
    locale: "en", // English-only page: a named law 7 deviation, not an accident.
  });

  if (!result.ok) back(result.reason, keep);

  // The ten answers with no columns. Written AFTER the upsert so a failure here
  // can never cost us the lead itself — the prospect row is the thing that
  // matters, and it is already safely stored.
  const meta: Record<string, string> = {};
  for (const f of META_FIELDS) {
    const v = get(f);
    if (v) meta[f] = v.slice(0, META_CAP);
  }
  meta.feedbackCallsConfirmed = "yes";
  meta.appliedAt = new Date().toISOString();
  if (rawSource) meta.arrivedFrom = rawSource.slice(0, CAPS.source);

  try {
    await rawPrisma.practitionerProspect.update({
      where: { email: email.toLowerCase() },
      data: { applicationMeta: meta },
    });
  } catch (e) {
    // Never block the applicant on the extras. The lead is captured; the
    // answers are recoverable from nothing, so this is logged loudly.
    console.error(`[founders] applicationMeta write failed for a captured prospect: ${e instanceof Error ? e.message : "error"}`);
  }

  redirect("/founders/apply/thanks");
}
