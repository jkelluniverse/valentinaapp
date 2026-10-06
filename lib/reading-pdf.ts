// The reading as a keepsake — a polished multi-page PDF report, hand-rolled
// in the same dependency-free style as the invoice (standard PDF fonts,
// WinAnsiEncoding, byte-accurate xref). Serif body (Times) to echo the site's
// Crimson Pro reading voice; Helvetica for the small labels.
//
// It renders the same markdown subset ReadingProse does: # / ## / ###
// headings, "-"/"*" bullets, paragraphs, inline **bold** and *italic*.

import { textWidth, pdfEscape } from "@/lib/invoice-pdf";

export type ReadingPdfInput = {
  locale: "en" | "es";
  clientName: string;
  content: string; // the reading markdown
  generatedDate: string; // pre-formatted for the locale
};

const L = {
  en: {
    eyebrow: "Veritas · a reading of your design",
    title: "What it all means to you",
    preparedFor: "Prepared for",
    closing:
      "A generated reflection drawn from your Human Design, Gene Keys, and values maps - a mirror to explore, not a verdict.",
    footer: "Valentina Vélez · Veritas Consulting",
    page: "Page",
  },
  es: {
    eyebrow: "Veritas · una lectura de tu diseño",
    title: "Lo que todo esto significa para ti",
    preparedFor: "Preparado para",
    closing:
      "Una reflexión generada a partir de tus mapas de Diseño Humano, Gene Keys y valores - un espejo para explorar, no un veredicto.",
    footer: "Valentina Vélez · Veritas Consulting",
    page: "Página",
  },
} as const;

// Brand colors as PDF rgb triples (mirrors the invoice).
const WINE = "0.345 0.047 0.133";
const INK = "0.16 0.13 0.12";
const SLATE = "0.45 0.41 0.39";
const MOCHA = "0.718 0.569 0.459";

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 68;
const RIGHT = PAGE_W - 68;
const TOP = PAGE_H - 72;
const BOTTOM = 84;
const MEASURE = RIGHT - LEFT;

// Fonts: F1 Times body, F2 Times bold, F3 Times italic, F4 Helvetica label,
// F5 Helvetica bold.
type FontKey = "F1" | "F2" | "F3" | "F4" | "F5";

type Run = { text: string; bold: boolean; italic: boolean };

function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, italic: false });
    if (m[2] != null) runs.push({ text: m[2], bold: true, italic: false });
    else runs.push({ text: m[3], bold: false, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, italic: false });
  return runs;
}

type Word = { word: string; bold: boolean; italic: boolean };

function toWords(runs: Run[]): Word[] {
  const words: Word[] = [];
  for (const r of runs) {
    for (const w of r.text.split(/\s+/)) {
      if (w) words.push({ word: w, bold: r.bold, italic: r.italic });
    }
  }
  return words;
}

// Greedy wrap over styled words; returns lines of styled words.
function wrapWords(words: Word[], size: number, maxWidth: number): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let w = 0;
  const space = textWidth(" ", size);
  for (const word of words) {
    const ww = textWidth(word.word, size);
    if (line.length > 0 && w + space + ww > maxWidth) {
      lines.push(line);
      line = [word];
      w = ww;
    } else {
      w += (line.length > 0 ? space : 0) + ww;
      line.push(word);
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export function renderReadingPdf(input: ReadingPdfInput): { base64: string; filename: string } {
  const t = L[input.locale];
  const pages: string[][] = [[]];
  let ops = pages[0];
  let y = TOP;

  function newPage() {
    pages.push([]);
    ops = pages[pages.length - 1];
    y = TOP;
  }
  function need(height: number) {
    if (y - height < BOTTOM) newPage();
  }
  function text(x: number, yy: number, str: string, font: FontKey, size: number, color = INK) {
    ops.push(
      `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${pdfEscape(str)}) Tj ET`,
    );
  }
  function rule(x: number, yy: number, w: number, h: number, color: string) {
    ops.push(`${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  // Emit one wrapped line of styled words: consecutive same-style words are
  // grouped into a single text op (native spacing, compact output); x only
  // advances by measured width at style boundaries.
  function emitLine(line: Word[], x0: number, size: number, opts: { color?: string; forceFont?: FontKey }) {
    let x = x0;
    let seg: string[] = [];
    let segStyle = "";
    const flush = () => {
      if (seg.length === 0) return;
      const str = seg.join(" ");
      const font: FontKey =
        opts.forceFont ?? (segStyle === "b" ? "F2" : segStyle === "i" ? "F3" : "F1");
      text(x, y, str, font, size, opts.color ?? INK);
      x += textWidth(`${str} `, size);
      seg = [];
    };
    for (const w of line) {
      const style = opts.forceFont ? "" : w.bold ? "b" : w.italic ? "i" : "";
      if (style !== segStyle && seg.length > 0) flush();
      segStyle = style;
      seg.push(w.word);
    }
    flush();
  }
  // One wrapped block of body text with inline styles. Returns nothing; moves y.
  function styledBlock(markdownLine: string, opts: { size: number; leading: number; indent?: number; color?: string; bullet?: boolean }) {
    const indent = opts.indent ?? 0;
    const lines = wrapWords(toWords(parseInline(markdownLine)), opts.size, MEASURE - indent - (opts.bullet ? 14 : 0));
    for (let li = 0; li < lines.length; li++) {
      need(opts.leading);
      if (opts.bullet && li === 0) text(LEFT + indent, y, "•", "F1", opts.size, MOCHA);
      emitLine(lines[li], LEFT + indent + (opts.bullet ? 14 : 0), opts.size, { color: opts.color });
      y -= opts.leading;
    }
  }
  function heading(str: string, size: number, before: number, after: number) {
    // Keep a heading with at least two lines of what follows it.
    if (y - (before + size + 40) < BOTTOM) newPage();
    else y -= before;
    const lines = wrapWords(toWords(parseInline(str)), size, MEASURE);
    for (const line of lines) {
      need(size + 6);
      emitLine(line, LEFT, size, { color: WINE, forceFont: "F2" });
      y -= size + 6;
    }
    y -= after;
  }

  // ---- Cover header (page 1) ----
  text(LEFT, y, t.eyebrow, "F3", 11, MOCHA);
  y -= 30;
  heading(t.title, 26, 0, 0);
  y -= 2;
  text(LEFT, y, `${t.preparedFor} ${input.clientName} · ${input.generatedDate}`, "F4", 9.5, SLATE);
  y -= 14;
  rule(LEFT, y, MEASURE, 1.2, WINE);
  y -= 28;

  // ---- Body ----
  const rawLines = input.content.replace(/\r\n/g, "\n").split("\n");
  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^\s*[-*]\s+/.test(line)) {
      styledBlock(line.replace(/^\s*[-*]\s+/, ""), { size: 11, leading: 16, indent: 10, bullet: true });
      y -= 2;
    } else if (/^###\s+/.test(line)) {
      heading(line.replace(/^###\s+/, ""), 12.5, 14, 6);
    } else if (/^##\s+/.test(line)) {
      heading(line.replace(/^##\s+/, ""), 16, 20, 8);
    } else if (/^#\s+/.test(line)) {
      heading(line.replace(/^#\s+/, ""), 20, 22, 10);
    } else {
      styledBlock(line, { size: 11, leading: 16 });
      y -= 6;
    }
  }

  // ---- Closing line ----
  need(60);
  y -= 8;
  rule(LEFT, y, MEASURE, 0.6, MOCHA);
  y -= 16;
  styledBlock(t.closing, { size: 9, leading: 12.5, color: SLATE });

  // ---- Footers (every page) ----
  pages.forEach((pageOps, i) => {
    const save = ops;
    ops = pageOps;
    rule(LEFT, 62, MEASURE, 0.6, MOCHA);
    text(LEFT, 50, t.footer, "F4", 8, SLATE);
    const pn = `${t.page} ${i + 1} / ${pages.length}`;
    text(RIGHT - textWidth(pn, 8), 50, pn, "F4", 8, SLATE);
    ops = save;
  });

  // ---- Assemble the file (multi-page xref) ----
  const fonts: Array<[FontKey, string]> = [
    ["F1", "Times-Roman"],
    ["F2", "Times-Bold"],
    ["F3", "Times-Italic"],
    ["F4", "Helvetica"],
    ["F5", "Helvetica-Bold"],
  ];
  const n = pages.length;
  // Object layout: 1 catalog · 2 pages · 3..2+n page objects · 3+n..2+2n
  // content streams · then the five fonts.
  const fontBase = 2 + 2 * n;
  const fontRes = fonts.map(([key], i) => `/${key} ${fontBase + i + 1} 0 R`).join(" ");
  const kids = pages.map((_, i) => `${3 + i} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`,
    ...pages.map(
      (_, i) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << ${fontRes} >> >> /Contents ${3 + n + i} 0 R >>`,
    ),
    ...pages.map((pageOps) => {
      const stream = pageOps.join("\n");
      return `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    }),
    ...fonts.map(([, base]) => `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`),
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

  const slug = input.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reading";
  return {
    base64: Buffer.from(body, "latin1").toString("base64"),
    filename: `veritas-reading-${slug}.pdf`,
  };
}
