// EMAIL-SPEC §2 — <Envelope>, the master layout every email uses. Rendered as
// email-safe table HTML (600px cream/white card, Georgia serif headings, ONE
// wine button max, dark-mode meta, no tracking pixels), faithful to the
// approved demo template. Every send also gets a plain-text part.
//
// Deviation from spec, on purpose: plain TypeScript template functions instead
// of React Email — identical output, zero new dependencies, and the demo HTML
// is the single source of design truth.

export type EnvelopeLocale = "en" | "es";

export type EnvelopeInput = {
  locale: EnvelopeLocale;
  /** Hidden inbox preview line. */
  preheader?: string;
  /** The serif heading, e.g. "María, your space is ready." */
  heading: string;
  /** Body paragraphs, in order. Plain text — escaped for HTML automatically. */
  paragraphs: string[];
  /** Optional italic personal-note block (her voice), rendered in the blush card. */
  note?: string | null;
  /** The one wine button. */
  button?: { label: string; url: string } | null;
  /** Small centered line under the button (expiry etc.). */
  whisper?: string | null;
  /** Closing block; defaults to "With warmth, / Valentina" per locale. */
  signoff?: string | null;
  /** Extra plain-text lines appended after the button URL in the text part. */
  textExtra?: string[];
};

const FOOTER: Record<EnvelopeLocale, string[]> = {
  en: [
    "Valentina Vélez · Veritas Consulting · Orlando, Florida",
    "Coaching — not medical or psychological treatment.",
    "Received this by mistake? You can simply ignore it.",
  ],
  es: [
    "Valentina Vélez · Veritas Consulting · Orlando, Florida",
    "Coaching — no es tratamiento médico ni psicológico.",
    "¿Lo recibiste por error? Puedes simplemente ignorarlo.",
  ],
};

const SIGNOFF: Record<EnvelopeLocale, string> = {
  en: "With warmth,",
  es: "Con cariño,",
};

const TAGLINE: Record<EnvelopeLocale, string> = {
  en: "Neuropsychology Specialist & Psych-K® Consultant",
  es: "Especialista en Neuropsicología y Consultora Psych-K®",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEnvelope(input: EnvelopeInput): { html: string; text: string } {
  const { locale } = input;
  const signoffLead = input.signoff ?? SIGNOFF[locale];
  const bodyFont = "-apple-system,'Segoe UI',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";

  const paragraphsHtml = input.paragraphs
    .map(
      (p, i) =>
        `<p class="ink" style="margin:${i === 0 ? "26px" : "16px"} 0 0;font-family:${bodyFont};font-size:16px;line-height:1.65;color:#4D4B49;">${esc(p)}</p>`,
    )
    .join("\n");

  const noteHtml = input.note
    ? `<table role="presentation" width="100%" style="margin:26px 0 0;">
        <tr><td style="background:#FFF4F8;border-radius:12px;padding:18px 22px;">
          <p style="margin:0;font-family:${serif};font-style:italic;font-size:16px;line-height:1.6;color:#580C22;">${esc(input.note)}</p>
        </td></tr>
      </table>`
    : "";

  const buttonHtml = input.button
    ? `<table role="presentation" style="margin:34px auto 0;">
        <tr><td align="center" style="border-radius:999px;background:#580C22;">
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(input.button.url)}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" fillcolor="#580C22" stroke="f"><center style="color:#ffffff;font-family:Georgia,serif;font-size:16px;">${esc(input.button.label)}</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-->
          <a href="${esc(input.button.url)}" style="display:inline-block;padding:15px 34px;font-family:${bodyFont};font-size:16px;font-weight:600;color:#FFFFFF;border-radius:999px;background:#580C22;">${esc(input.button.label)}</a>
          <!--<![endif]-->
        </td></tr>
      </table>`
    : "";

  const whisperHtml = input.whisper
    ? `<p class="whisper" align="center" style="margin:18px 0 0;font-family:${bodyFont};font-size:13px;color:#8A8580;text-align:center;">${esc(input.whisper)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${locale}" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(input.heading)}</title>
<!--[if mso]><style>table{border-collapse:collapse}h1,p,a{font-family:Georgia,serif !important}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:#FEF4EA;-webkit-text-size-adjust:100%}
  table{border-spacing:0}
  img{border:0;display:block}
  a{text-decoration:none}
  @media (prefers-color-scheme: dark){
    .bg{background:#191114 !important}
    .card{background:#241A21 !important}
    .ink{color:#E9DFD7 !important}
    .ink-strong{color:#F8F1E9 !important}
    .whisper{color:#9A8B90 !important}
    .brand-fallback{color:#E9DFD7 !important}
  }
  @media only screen and (max-width:620px){
    .card{width:100% !important; border-radius:0 !important}
    .inner{padding:32px 24px !important}
  }
</style>
</head>
<body class="bg" style="background:#FEF4EA;">
  ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(input.preheader)}</div>` : ""}
  <table role="presentation" width="100%" class="bg" style="background:#FEF4EA;">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="600" class="card" style="background:#FFFFFF;border-radius:16px;box-shadow:0 12px 32px rgba(88,12,34,0.07);max-width:600px;width:100%;">
        <tr><td class="inner" style="padding:44px 48px;">
          <p class="brand-fallback" style="margin:0;font-family:${serif};font-size:21px;font-weight:bold;color:#580C22;">
            Valentina Vélez <span style="color:#B79175;">✦</span>
          </p>
          <p class="whisper" style="margin:4px 0 0;font-family:${bodyFont};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#B79175;">
            ${esc(TAGLINE[locale])}
          </p>
          <h1 class="ink-strong" style="margin:36px 0 0;font-family:${serif};font-size:30px;line-height:1.2;font-weight:normal;color:#161616;">
            ${esc(input.heading)}
          </h1>
          <table role="presentation"><tr><td style="padding:18px 0 0;"><table role="presentation" width="54"><tr><td style="height:2px;background:#B79175;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr></table>
          ${paragraphsHtml}
          ${noteHtml}
          ${buttonHtml}
          ${whisperHtml}
          <p class="ink" style="margin:36px 0 0;font-family:${serif};font-size:16px;line-height:1.6;color:#4D4B49;">
            ${esc(signoffLead)}<br>
            <span style="color:#580C22;">Valentina</span>
          </p>
        </td></tr>
      </table>
      <table role="presentation" width="600" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:26px 24px 0;">
          <p class="whisper" style="margin:0;font-family:${bodyFont};font-size:12px;line-height:1.7;color:#8A8580;">
            ${FOOTER[locale].map(esc).join("<br>\n            ")}
          </p>
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
    signoffLead,
    "Valentina",
    "",
    "—",
    ...FOOTER[locale],
  ];

  return { html, text: textLines.join("\n") };
}
