import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";

// C20 v3.1 — install counsel's revised master Client Services Agreement.
// HARD RULES (install spec §0): the body is read VERBATIM from
// content/agreements/client-services-agreement.v3.1.txt — never edited,
// not a comma. The v3.0 continuation markers ("[Sections … continue
// unchanged from original]") stay intact until Jacob supplies v3.0's text.
// Status is DRAFT: the send path refuses it until Jacob flips it live.

export const V31_SLUG = "client-services-agreement";
export const V31_VERSION = 3; // versionLabel carries the precise "3.1"
export const V31_LABEL = "3.1";

// The signature page's 9 required initial points + Exhibit B's embedded
// acknowledgment checkbox. Text here is quoted VERBATIM from counsel's
// document (it renders beside each capture field and on the sealed PDF).
export const V31_INITIAL_ITEMS = [
  { id: "non-clinical", kind: "initials", required: true, text: "I understand these are non-clinical personal development and facilitation services — not psychotherapy, psychology, mental health treatment, medical care, diagnosis, or crisis care. The Practitioner is a Certified PSYCH-K® Facilitator and Personal Development Consultant, not a licensed psychologist or therapist." },
  { id: "not-monitored", kind: "initials", required: true, text: "I understand messages and automated safety features are not continuously monitored and are not emergency services; in an emergency I will call 911 or 988." },
  { id: "e-records-ai", kind: "initials", required: true, text: "I consent to electronic records and signatures (per Exhibit B - Electronic Records Disclosure) and to the AI-assisted and third-party processing described in Sections 6–8 and the Privacy Policy." },
  { id: "cancellation", kind: "initials", required: true, text: "I reviewed and accept the cancellation, no-show, package-credit, and refund terms shown immediately above." },
  { id: "chargeback", kind: "initials", required: true, text: "I understand that initiating a chargeback or payment dispute before contacting the Practice first (except for unauthorized charges) may result in responsibility for chargeback fees, dispute-processing costs, and attorney fees if resolved in the Practice's favor, as stated in Section 24." },
  { id: "payer", kind: "initials", required: true, text: "I understand a Third-Party Payer must separately sign Exhibit A before their card is charged, and that payment gives no one access to my confidential content." },
  { id: "recording", kind: "initials", required: true, text: "I understand recording requires the separate Recording Addendum and per-session confirmation, and that Florida law (§934.03) makes secret recording a criminal offense." },
  { id: "retention-election", kind: "initials", required: true, text: "I acknowledge the Data Retention & Deletion Schedule (Addendum R) and made my pattern-library election (Addendum P)." },
  { id: "liability-venue", kind: "initials", required: true, text: "I reviewed the limitation-of-liability and Orange County, Florida venue provisions, and understand venue in Orange County is exclusive and mandatory." },
  { id: "exhibit-b-ack", kind: "checkbox", required: true, text: "I acknowledge and accept the Electronic Records Disclosure above." },
] as const;

// Sections the v3.1 delta references but does not contain — assembling the
// complete document means pasting v3.0's text at these markers, verbatim,
// when Jacob supplies it. NEVER reconstructed.
export const V31_MISSING_SECTIONS = [
  "Sections 9–13",
  "Sections 15–21",
  "Sections 23–24",
  "Sections 26–27",
  "Exhibit A — content through Part 2, and Parts 3–6",
  "Addendum M — body (only the new custody/subpoena checkbox is in the delta)",
  "Addendum R — entire text",
  "Addendum P — entire text",
];

export async function installMasterV31(tenantId: string): Promise<{ installed: boolean; templateId: string }> {
  const body = readFileSync(join(process.cwd(), "content/agreements/client-services-agreement.v3.1.txt"), "utf8");
  const existing = await prisma.agreementTemplate.findFirst({
    where: { tenantId, slug: V31_SLUG, version: V31_VERSION, locale: "en" },
  });
  if (existing) {
    // Idempotent: refresh the body ONLY if the repo file changed (counsel
    // revision landed); never touch a template Jacob already flipped ACTIVE.
    if (existing.body !== body && existing.status === "DRAFT") {
      await prisma.agreementTemplate.update({ where: { id: existing.id }, data: { body } });
    }
    return { installed: false, templateId: existing.id };
  }
  const row = await prisma.agreementTemplate.create({
    data: {
      tenantId,
      slug: V31_SLUG,
      version: V31_VERSION,
      versionLabel: V31_LABEL,
      locale: "en",
      title: "Client Services Agreement",
      body,
      initialItems: V31_INITIAL_ITEMS as unknown as import("@prisma/client").Prisma.InputJsonValue,
      requiresCountersign: true, // counsel's signature page has her countersignature
      status: "DRAFT", // not sendable until Jacob flips it
      placeholder: false, // counsel's work product — real text, held by status
      requireBeforeBooking: true, // §1: portal may block booking until required signatures complete
    },
  });
  return { installed: true, templateId: row.id };
}
