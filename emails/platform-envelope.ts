// C27-EMAIL-IDENTITY Phase 1 — the PLATFORM envelope. A second envelope, not an
// edit to the practice one: platform-identity mail (practitioner follow-up) and
// practice-identity mail (everything a practice sends its clients) are
// different kinds of message composed by different code paths (spec §Phase 1).
//
// EVERY identifying string here is CONFIG, never copy invented in code:
//   · the header and signature name = the display-name half of
//     PLATFORM_FROM_EMAIL ("Name <addr>") — the message signs as exactly the
//     identity it is sent from, nothing else;
//   · the footer = PLATFORM_LEGAL_ENTITY · PLATFORM_POSTAL_ADDRESS, verbatim.
// No practice letterhead, no practitioner credential, no borrowed wordmark
// (spec §Phase 1.1). Visual chrome follows the platform brand tokens
// (BRAND_HANDOFF.md §2: indigo ink, gold accent) without asserting any name.
import type { EnvelopeInput } from "@/emails/envelope";
import type { PlatformIdentity } from "@/lib/notify";

/** "Display Name <addr@domain>" → "Display Name"; a bare address → the address. */
export function displayNameOf(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from).trim();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderPlatformEnvelope(
  input: EnvelopeInput,
  identity: Pick<PlatformIdentity, "from" | "legalEntity" | "postalAddress">,
): { html: string; text: string } {
  const senderName = displayNameOf(identity.from);
  const bodyFont = "-apple-system,'Segoe UI',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const footerLines = [`${identity.legalEntity} · ${identity.postalAddress}`];

  const paragraphsHtml = input.paragraphs
    .map(
      (p, i) =>
        `<p class="ink" style="margin:${i === 0 ? "26px" : "16px"} 0 0;font-family:${bodyFont};font-size:16px;line-height:1.65;color:#3D3A45;">${esc(p)}</p>`,
    )
    .join("\n");

  const buttonHtml = input.button
    ? `<table role="presentation" style="margin:34px auto 0;">
        <tr><td align="center" style="border-radius:999px;background:#2E2749;">
          <a href="${esc(input.button.url)}" style="display:inline-block;padding:15px 34px;font-family:${bodyFont};font-size:16px;font-weight:600;color:#FFFFFF;border-radius:999px;background:#2E2749;text-decoration:none;">${esc(input.button.label)}</a>
        </td></tr>
      </table>`
    : "";

  const whisperHtml = input.whisper
    ? `<p class="whisper" align="center" style="margin:18px 0 0;font-family:${bodyFont};font-size:13px;color:#8A8597;text-align:center;">${esc(input.whisper)}</p>`
    : "";

  const signoffHtml = input.signoff
    ? `<p class="ink" style="margin:36px 0 0;font-family:${serif};font-size:16px;line-height:1.6;color:#3D3A45;">
            ${esc(input.signoff)}<br>
            <span style="color:#2E2749;">${esc(senderName)}</span>
          </p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(input.heading)}</title>
<style>
  body{margin:0;padding:0;background:#F5F0E6;-webkit-text-size-adjust:100%}
  table{border-spacing:0}
  a{text-decoration:none}
  @media (prefers-color-scheme: dark){
    .bg{background:#16132A !important}
    .card{background:#211C3A !important}
    .ink{color:#F2ECDF !important}
    .ink-strong{color:#F2ECDF !important}
    .whisper{color:#9A93B0 !important}
    .brand-fallback{color:#F2ECDF !important}
  }
  @media only screen and (max-width:620px){
    .card{width:100% !important; border-radius:0 !important}
    .inner{padding:32px 24px !important}
  }
</style>
</head>
<body class="bg" style="background:#F5F0E6;">
  ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(input.preheader)}</div>` : ""}
  <table role="presentation" width="100%" class="bg" style="background:#F5F0E6;">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="600" class="card" style="background:#FFFFFF;border-radius:14px;box-shadow:0 8px 24px rgba(20,26,46,0.06);max-width:600px;width:100%;">
        <tr><td class="inner" style="padding:44px 48px;">
          <p class="brand-fallback" style="margin:0;font-family:${serif};font-size:20px;font-weight:bold;color:#2E2749;">
            ${esc(senderName)}
          </p>
          <h1 class="ink-strong" style="margin:34px 0 0;font-family:${serif};font-size:29px;line-height:1.2;font-weight:normal;color:#141A2E;">
            ${esc(input.heading)}
          </h1>
          <table role="presentation"><tr><td style="padding:18px 0 0;"><table role="presentation" width="40"><tr><td style="height:2px;background:#D8A441;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr></table>
          ${paragraphsHtml}
          ${buttonHtml}
          ${whisperHtml}
          ${signoffHtml}
        </td></tr>
      </table>
      <table role="presentation" width="600" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:26px 24px 0;">
          <p class="whisper" style="margin:0;font-family:${bodyFont};font-size:12px;line-height:1.7;color:#8A8597;">
            ${footerLines.map(esc).join("<br>\n            ")}
          </p>
          ${
            input.unsubscribe
              ? `<p class="whisper" style="margin:10px 0 0;font-family:${bodyFont};font-size:12px;line-height:1.7;color:#8A8597;">
            <a href="${esc(input.unsubscribe.url)}" style="color:#8A8597;text-decoration:underline;">${esc(input.unsubscribe.label)}</a>
          </p>`
              : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    input.heading,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    ...(input.textExtra?.length ? [...input.textExtra, ""] : []),
    ...(input.whisper ? [input.whisper, ""] : []),
    ...(input.signoff ? [input.signoff, senderName, ""] : []),
    "—",
    ...footerLines,
    ...(input.unsubscribe ? [`${input.unsubscribe.label}: ${input.unsubscribe.url}`] : []),
  ];

  return { html, text: textLines.join("\n") };
}
