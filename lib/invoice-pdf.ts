// A single-page PDF invoice, built by hand — no PDF library, no native deps.
// Uses only the PDF standard fonts (Helvetica / Helvetica-Bold) with
// WinAnsiEncoding, which covers Spanish accents (Vélez, sesión). Anything
// outside Latin-1 degrades to "?" rather than corrupting the file.
//
// Why hand-rolled: the invoice is one page of text and rules, and a real PDF
// dependency would be the largest package in the app for exactly this file.

export type InvoicePdfInput = {
  locale: "en" | "es";
  invoiceNumber: string;
  issuedDate: string; // pre-formatted for the locale
  dueDate?: string | null;
  billedToLines: string[]; // name, "c/o payee", email, address lines
  description: string;
  amount: string; // pre-formatted, e.g. "$1,200.00"
  note?: string | null;
  payUrl?: string | null;
};

const LABELS = {
  en: {
    invoice: "INVOICE",
    number: "Invoice no.",
    issued: "Issued",
    due: "Due",
    billedTo: "BILLED TO",
    description: "DESCRIPTION",
    amount: "AMOUNT",
    total: "Total due",
    note: "A note from Valentina",
    pay: "Pay online",
    payLine: "This invoice can be paid securely online:",
    footer: "Valentina Vélez · Veritas Consulting · Orlando, Florida",
  },
  es: {
    invoice: "FACTURA",
    number: "Factura n.º",
    issued: "Emitida",
    due: "Vence",
    billedTo: "FACTURADO A",
    description: "DESCRIPCIÓN",
    amount: "MONTO",
    total: "Total a pagar",
    note: "Una nota de Valentina",
    pay: "Pagar en línea",
    payLine: "Esta factura puede pagarse en línea de forma segura:",
    footer: "Valentina Vélez · Veritas Consulting · Orlando, Florida",
  },
} as const;

// Brand colors as PDF rgb triples.
const WINE = "0.345 0.047 0.133";
const INK = "0.16 0.13 0.12";
const SLATE = "0.45 0.41 0.39";
const MOCHA = "0.718 0.569 0.459";

// Approximate Helvetica advance widths (em fractions) — good enough for
// wrapping and right-alignment on a one-page document.
function charW(ch: string): number {
  if ("iljI.,:;'|!".includes(ch)) return 0.28;
  if ("ftr()[]-\" ".includes(ch)) return 0.34;
  if ("mwMW@".includes(ch)) return 0.89;
  if (/[A-Z]/.test(ch)) return 0.67;
  return 0.53;
}
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += charW(ch);
  return w * size;
}
function wrap(s: string, size: number, maxWidth: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// WinAnsi-safe: normalize typographic chars, drop anything outside Latin-1,
// escape the three characters PDF string literals care about.
function pdfEscape(s: string): string {
  const normalized = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  return normalized.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderInvoicePdf(input: InvoicePdfInput): { base64: string; filename: string } {
  const L = LABELS[input.locale];
  const ops: string[] = [];
  const PAGE_W = 612;
  const LEFT = 64;
  const RIGHT = PAGE_W - 64;

  function text(
    x: number,
    y: number,
    str: string,
    opts: { bold?: boolean; size?: number; color?: string } = {},
  ) {
    const size = opts.size ?? 10;
    ops.push(
      `BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${opts.color ?? INK} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(str)}) Tj ET`,
    );
  }
  function textRight(x: number, y: number, str: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
    text(x - textWidth(str, opts.size ?? 10), y, str, opts);
  }
  function rule(x: number, y: number, w: number, h: number, color: string) {
    ops.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  let y = 792 - 70;

  // Letterhead
  text(LEFT, y, "Valentina Vélez", { bold: true, size: 19, color: WINE });
  textRight(RIGHT, y, L.invoice, { bold: true, size: 13, color: MOCHA });
  y -= 15;
  text(LEFT, y, "Veritas Consulting · Orlando, Florida", { size: 8.5, color: SLATE });
  y -= 14;
  rule(LEFT, y, RIGHT - LEFT, 1.2, WINE);
  y -= 28;

  // Meta block (right) + billed-to (left), side by side.
  const metaTop = y;
  text(LEFT, y, L.billedTo, { bold: true, size: 8, color: MOCHA });
  y -= 14;
  for (const line of input.billedToLines.filter(Boolean).slice(0, 6)) {
    text(LEFT, y, line, { size: 10 });
    y -= 13;
  }
  let my = metaTop;
  const meta: Array<[string, string]> = [
    [L.number, input.invoiceNumber],
    [L.issued, input.issuedDate],
    ...(input.dueDate ? ([[L.due, input.dueDate]] as Array<[string, string]>) : []),
  ];
  for (const [label, value] of meta) {
    textRight(RIGHT - 110, my, label, { size: 9, color: SLATE });
    textRight(RIGHT, my, value, { size: 9.5 });
    my -= 13;
  }
  y = Math.min(y, my) - 24;

  // Line items table
  rule(LEFT, y + 12, RIGHT - LEFT, 0.6, MOCHA);
  text(LEFT, y, L.description, { bold: true, size: 8, color: MOCHA });
  textRight(RIGHT, y, L.amount, { bold: true, size: 8, color: MOCHA });
  y -= 8;
  rule(LEFT, y, RIGHT - LEFT, 0.6, MOCHA);
  y -= 18;
  const descLines = wrap(input.description, 10.5, RIGHT - LEFT - 110);
  textRight(RIGHT, y, input.amount, { size: 10.5 });
  for (const line of descLines) {
    text(LEFT, y, line, { size: 10.5 });
    y -= 14;
  }
  y -= 4;
  rule(LEFT, y + 8, RIGHT - LEFT, 0.6, MOCHA);
  y -= 12;
  text(LEFT, y, L.total, { bold: true, size: 11, color: WINE });
  textRight(RIGHT, y, input.amount, { bold: true, size: 11, color: WINE });
  y -= 34;

  // Her note, in her voice.
  if (input.note) {
    text(LEFT, y, L.note, { bold: true, size: 8, color: MOCHA });
    y -= 14;
    for (const line of wrap(input.note, 9.5, RIGHT - LEFT).slice(0, 6)) {
      text(LEFT, y, line, { size: 9.5, color: SLATE });
      y -= 12;
    }
    y -= 16;
  }

  // How to pay
  if (input.payUrl) {
    text(LEFT, y, L.pay, { bold: true, size: 8, color: MOCHA });
    y -= 14;
    text(LEFT, y, L.payLine, { size: 9.5 });
    y -= 13;
    for (const line of wrap(input.payUrl, 9, RIGHT - LEFT)) {
      text(LEFT, y, line, { size: 9, color: WINE });
      y -= 12;
    }
  }

  // Footer
  rule(LEFT, 74, RIGHT - LEFT, 0.6, MOCHA);
  text(LEFT, 60, L.footer, { size: 8, color: SLATE });

  const stream = ops.join("\n");

  // Assemble the file. Offsets are byte-accurate because everything is
  // serialized as latin1 (one byte per char) — that's what makes the
  // hand-built xref table safe.
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return {
    base64: Buffer.from(body, "latin1").toString("base64"),
    filename: `invoice-${input.invoiceNumber}.pdf`,
  };
}
