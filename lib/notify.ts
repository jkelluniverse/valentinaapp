// Transactional email via Resend's REST API (no SDK dependency). Everything
// degrades gracefully: with no RESEND_API_KEY the app still works and booking
// just skips the email. Appointment content never goes to logs (spec §9) — we
// log only whether a send was attempted and its coarse outcome.

type Attachment = { filename: string; content: string; contentType?: string };

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!emailConfigured()) {
    console.info("[notify] email not configured — skipping send");
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL,
        to: args.to,
        subject: args.subject,
        text: args.text,
        attachments: args.attachments?.map((a) => ({
          filename: a.filename,
          // Resend expects base64 content for attachments.
          content: Buffer.from(a.content, "utf8").toString("base64"),
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
