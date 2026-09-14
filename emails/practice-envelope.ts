// C27-EMAIL-IDENTITY §Phase 2 — the envelope a NON-DEFAULT practice's client
// mail wears: the practice's own name in the header and signature, the
// practice's own footer (name · postal address, when set), replies to the
// practice's own email (set at the transport, not here). Nothing borrowed:
// no Valentina strings, no Veritas footer, no platform wordmark, no other
// practice's palette (neutral warm-white chrome — Warm Stone wine/mocha is
// tenant #1's, the indigo/gold is the platform's).
//
// Every identifying string is DATA from the practice's own tenant row and
// PracticeSettings — nothing is invented in code.
import type { EnvelopeInput } from "@/emails/envelope";
import type { PracticeIdentity } from "@/lib/notify";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderPracticeEnvelope(
  input: EnvelopeInput,
  identity: Pick<PracticeIdentity, "displayName" | "postalAddress" | "replyTo">,
): { html: string; text: string } {
  const bodyFont = "-apple-system,'Segoe UI',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const footerLines = [
    identity.postalAddress ? `${identity.displayName} · ${identity.postalAddress}` : identity.displayName,
  ];

  const paragraphsHtml = input.paragraphs
    .map(
      (p, i) =>
        `<p class="ink" style="margin:${i === 0 ? "26px" : "16px"} 0 0;font-family:${bodyFont};font-size:16px;line-height:1.65;color:#44413C;">${esc(p)}</p>`,
    )
    .join("\n");

  const noteHtml = input.note
    ? `<table role="presentation" width="100%" style="margin:26px 0 0;">
        <tr><td style="background:#F4F1EB;border-radius:12px;padding:18px 22px;">
          <p style="margin:0;font-family:${serif};font-style:italic;font-size:16px;line-height:1.6;color:#3A372F;">${esc(input.note)}</p>
        </td></tr>
      </table>`
    : "";

  const buttonHtml = input.button
    ? `<table role="presentation" style="margin:34px auto 0;">
        <tr><td align="center" style="border-radius:999px;background:#3A372F;">
          <a href="${esc(input.button.url)}" style="display:inline-block;padding:15px 34px;font-family:${bodyFont};font-size:16px;font-weight:600;color:#FFFFFF;border-radius:999px;background:#3A372F;text-decoration:none;">${esc(input.button.label)}</a>
        </td></tr>
      </table>`
    : "";

  const whisperHtml = input.whisper
    ? `<p class="whisper" align="center" style="margin:18px 0 0;font-family:${bodyFont};font-size:13px;color:#8D897F;text-align:center;">${esc(input.whisper)}</p>`
    : "";

  const signoffHtml = input.signoff
    ? `<p class="ink" style="margin:36px 0 0;font-family:${serif};font-size:16px;line-height:1.6;color:#44413C;">
            ${esc(input.signoff)}<br>
            <span style="color:#3A372F;">${esc(identity.displayName)}</span>
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
  body{margin:0;padding:0;background:#F7F4EE;-webkit-text-size-adjust:100%}
  table{border-spacing:0}
  a{text-decoration:none}
  @media (prefers-color-scheme: dark){
    .bg{background:#17150F !important}
    .card{background:#211F18 !important}
    .ink{color:#EAE5DA !important}
    .ink-strong{color:#F5F1E8 !important}
    .whisper{color:#97927F !important}
    .brand-fallback{color:#EAE5DA !important}
  }
  @media only screen and (max-width:620px){
    .card{width:100% !important; border-radius:0 !important}
    .inner{padding:32px 24px !important}
  }
</style>
</head>
<body class="bg" style="background:#F7F4EE;">
  ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(input.preheader)}</div>` : ""}
  <table role="presentation" width="100%" class="bg" style="background:#F7F4EE;">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="600" class="card" style="background:#FFFFFF;border-radius:14px;box-shadow:0 8px 24px rgba(35,32,25,0.06);max-width:600px;width:100%;">
        <tr><td class="inner" style="padding:44px 48px;">
          <p class="brand-fallback" style="margin:0;font-family:${serif};font-size:21px;font-weight:bold;color:#3A372F;">
            ${esc(identity.displayName)}
          </p>
          <h1 class="ink-strong" style="margin:34px 0 0;font-family:${serif};font-size:29px;line-height:1.2;font-weight:normal;color:#191712;">
            ${esc(input.heading)}
          </h1>
          <table role="presentation"><tr><td style="padding:18px 0 0;"><table role="presentation" width="40"><tr><td style="height:2px;background:#B8B2A2;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr></table>
          ${paragraphsHtml}
          ${noteHtml}
          ${buttonHtml}
          ${whisperHtml}
          ${signoffHtml}
        </td></tr>
      </table>
      <table role="presentation" width="600" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:26px 24px 0;">
          <p class="whisper" style="margin:0;font-family:${bodyFont};font-size:12px;line-height:1.7;color:#8D897F;">
            ${footerLines.map(esc).join("<br>\n            ")}
          </p>
          ${
            input.unsubscribe
              ? `<p class="whisper" style="margin:10px 0 0;font-family:${bodyFont};font-size:12px;line-height:1.7;color:#8D897F;">
            <a href="${esc(input.unsubscribe.url)}" style="color:#8D897F;text-decoration:underline;">${esc(input.unsubscribe.label)}</a>
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
    ...(input.note ? [input.note, ""] : []),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    ...(input.textExtra?.length ? [...input.textExtra, ""] : []),
    ...(input.whisper ? [input.whisper, ""] : []),
    ...(input.signoff ? [input.signoff, identity.displayName, ""] : []),
    "—",
    ...footerLines,
    ...(input.unsubscribe ? [`${input.unsubscribe.label}: ${input.unsubscribe.url}`] : []),
  ];

  return { html, text: textLines.join("\n") };
}
