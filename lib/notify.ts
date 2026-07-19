// Transactional email via Resend's REST API (no SDK dependency). Everything
// degrades gracefully: with no RESEND_API_KEY the app still works and booking
// just skips the email. Appointment content never goes to logs (spec §9) — we
// log only whether a send was attempted and its coarse outcome.
//
// EMAIL-SPEC — every send goes out branded: callers may pass a full `envelope`
// (heading/button/note per the demo template), and plain text-only sends are
// wrapped into the same Envelope automatically (subject as the heading, text
// split into paragraphs) so nothing in the app ever emails un-branded.

import { renderEnvelope, type EnvelopeInput } from "@/emails/envelope";

type Attachment = {
  filename: string;
  /** UTF-8 text content (ICS invites, plain files)… */
  content?: string;
  /** …or pre-encoded base64 for binary payloads (PDF invoices). */
  contentBase64?: string;
  contentType?: string;
};

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
  /** Rich branded layout; when omitted, a default Envelope wraps the text. */
  envelope?: Omit<EnvelopeInput, "heading" | "paragraphs"> &
    Partial<Pick<EnvelopeInput, "heading" | "paragraphs">>;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

// EMAIL-SPEC §1 — staging must never email a real client. On any non-production
// Railway environment, sends are allowed only to fixture addresses and the
// comma-separated EMAIL_TEAM_ALLOWLIST.
function allowedInThisEnvironment(to: string): boolean {
  const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!envName || envName === "production") return true;
  const addr = to.toLowerCase();
  if (addr.endsWith("@fixture.test")) return true;
  const team = (process.env.EMAIL_TEAM_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return team.includes(addr);
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!emailConfigured()) {
    console.info("[notify] email not configured — skipping send");
    return { ok: false, skipped: true };
  }
  if (!allowedInThisEnvironment(args.to)) {
    console.info("[notify] non-production environment — send suppressed (allowlist)");
    return { ok: false, skipped: true };
  }
  try {
    // Every email ships branded HTML + the plain-text part.
    const envelope: EnvelopeInput = {
      locale: args.envelope?.locale ?? "en",
      heading: args.envelope?.heading ?? args.subject,
      paragraphs:
        args.envelope?.paragraphs ??
        args.text
          .split(/\n{2,}/)
          .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
          .filter(Boolean),
      preheader: args.envelope?.preheader,
      note: args.envelope?.note,
      button: args.envelope?.button,
      whisper: args.envelope?.whisper,
      signoff: args.envelope?.signoff,
      textExtra: args.envelope?.textExtra,
    };
    const rendered = renderEnvelope(envelope);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL,
        ...(process.env.REPLY_TO_EMAIL ? { reply_to: process.env.REPLY_TO_EMAIL } : {}),
        to: args.to,
        subject: args.subject,
        text: args.envelope ? rendered.text : args.text,
        html: rendered.html,
        attachments: args.attachments?.map((a) => ({
          filename: a.filename,
          // Resend expects base64 content for attachments.
          content: a.contentBase64 ?? Buffer.from(a.content ?? "", "utf8").toString("base64"),
          contentType: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      console.error(`[notify] send failed: ${res.status}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notify] send threw", err instanceof Error ? err.message : "unknown");
    return { ok: false };
  }
}
