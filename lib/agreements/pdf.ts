import { textWidth, pdfEscape } from "@/lib/invoice-pdf";

// C20 §4 — the sealed agreement PDF: the exact agreement text (the
// client's locale version, exactly as signed), a signature page, and an
// audit-certificate page built from the append-only event trail. Same
// hand-rolled approach as the invoice PDF (standard fonts, no deps),
// generalized to multiple pages.

export type SealInput = {
  title: string;
  body: string; // bodySnapshot — the exact text signed
  locale: "en" | "es";
  practiceName: string;
  signer: { name: string; at: string; ip?: string | null; agent?: string | null; drawn?: boolean };
  countersigner?: { name: string; at: string } | null;
  disclosure: string;
  disclosureShownAt: string | null;
  events: { at: string; kind: string; actor: string; detail?: string }[];
  agreementId: string;
  paperSigned?: boolean;
};

const L = {
  en: {
    sigPage: "SIGNATURES",
    signedBy: "Signed by",
    counterBy: "Countersigned by",
    drawnNote: "A drawn signature mark was provided and is stored with this record.",
    paperNote: "This agreement was signed on paper; the scan is attached to the record.",
    disclosure: "ELECTRONIC RECORDS DISCLOSURE (shown before signing)",
    audit: "AUDIT CERTIFICATE",
    auditLede: "Every recorded event for this agreement, in order, with attribution.",
    docId: "Agreement record",
  },
  es: {
    sigPage: "FIRMAS",
    signedBy: "Firmado por",
    counterBy: "Contrafirmado por",
    drawnNote: "Se proporcionó una firma dibujada; se conserva con este registro.",
    paperNote: "Este acuerdo se firmó en papel; el escaneo acompaña el registro.",
    disclosure: "DIVULGACIÓN DE REGISTROS ELECTRÓNICOS (mostrada antes de firmar)",
    audit: "CERTIFICADO DE AUDITORÍA",
    auditLede: "Cada evento registrado de este acuerdo, en orden, con atribución.",
    docId: "Registro del acuerdo",
  },
} as const;

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 64;
const BODY_W = PAGE_W - MARGIN * 2;

type Line = { text: string; size: number; bold?: boolean; color?: string; gap?: number };

const WINE = "0.345 0.047 0.133";
const INK = "0.16 0.13 0.12";
const SLATE = "0.45 0.41 0.39";

function wrapText(s: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (textWidth(cand, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else line = cand;
    }
    if (line) out.push(line);
  }
  return out;
}

// Paginate lines into content streams.
function paginate(lines: Line[]): string[] {
  const pages: string[] = [];
  let y = PAGE_H - MARGIN;
  let ops: string[] = [];
  const flush = () => {
    pages.push(ops.join("\n"));
    ops = [];
    y = PAGE_H - MARGIN;
  };
  for (const line of lines) {
    const lineHeight = line.size * 1.45 + (line.gap ?? 0);
    if (y - lineHeight < MARGIN) flush();
    y -= lineHeight;
    if (line.text) {
      const font = line.bold ? "/F2" : "/F1";
      ops.push(`BT ${font} ${line.size} Tf ${line.color ?? INK} rg ${MARGIN} ${y.toFixed(1)} Td (${pdfEscape(line.text)}) Tj ET`);
    }
  }
  if (ops.length) flush();
  return pages;
}

export function renderSealedPdf(input: SealInput): Buffer {
  const t = L[input.locale] ?? L.en;
  const lines: Line[] = [];

  // ---- Agreement text ----
  lines.push({ text: input.practiceName, size: 10, color: SLATE });
  lines.push({ text: input.title, size: 18, bold: true, color: WINE, gap: 6 });
  lines.push({ text: "", size: 6 });
  for (const l of wrapText(input.body, 10.5, BODY_W)) lines.push({ text: l, size: 10.5 });

  // ---- Signature page ----
  lines.push({ text: "", size: 10, gap: 24 });
  lines.push({ text: t.sigPage, size: 13, bold: true, color: WINE, gap: 10 });
  lines.push({ text: `${t.signedBy}: ${input.signer.name}`, size: 11, bold: true, gap: 6 });
  lines.push({ text: `${input.signer.at}${input.signer.ip ? ` · IP ${input.signer.ip}` : ""}`, size: 9.5, color: SLATE });
  if (input.signer.agent) for (const l of wrapText(input.signer.agent, 8.5, BODY_W)) lines.push({ text: l, size: 8.5, color: SLATE });
  if (input.signer.drawn) lines.push({ text: t.drawnNote, size: 9.5, color: SLATE, gap: 2 });
  if (input.paperSigned) lines.push({ text: t.paperNote, size: 9.5, color: SLATE, gap: 2 });
  if (input.countersigner) {
    lines.push({ text: `${t.counterBy}: ${input.countersigner.name}`, size: 11, bold: true, gap: 8 });
    lines.push({ text: input.countersigner.at, size: 9.5, color: SLATE });
  }
  lines.push({ text: t.disclosure, size: 10, bold: true, gap: 14 });
  if (input.disclosureShownAt) lines.push({ text: input.disclosureShownAt, size: 9, color: SLATE });
  for (const l of wrapText(input.disclosure, 9, BODY_W)) lines.push({ text: l, size: 9, color: SLATE });

  // ---- Audit certificate ----
  lines.push({ text: "", size: 10, gap: 24 });
  lines.push({ text: t.audit, size: 13, bold: true, color: WINE, gap: 8 });
  lines.push({ text: t.auditLede, size: 9.5, color: SLATE, gap: 4 });
  for (const e of input.events) {
    lines.push({ text: `${e.at}  ·  ${e.kind}  ·  ${e.actor}${e.detail ? `  ·  ${e.detail}` : ""}`, size: 9 });
  }
  lines.push({ text: `${t.docId}: ${input.agreementId}`, size: 8.5, color: SLATE, gap: 10 });

  const pageStreams = paginate(lines);

  // ---- Assemble the PDF object graph ----
  const objects: string[] = [];
  const n = pageStreams.length;
  // 1 catalog, 2 pages, 3..(2+n) page objs, then n streams, then 2 fonts
  const pageIds = pageStreams.map((_, i) => 3 + i);
  const streamIds = pageStreams.map((_, i) => 3 + n + i);
  const fontId = 3 + 2 * n;
  const boldId = fontId + 1;

  objects.push(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`);
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >> endobj`);
  pageStreams.forEach((_, i) => {
    objects.push(
      `${pageIds[i]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> >> endobj`
    );
  });
  pageStreams.forEach((stream, i) => {
    objects.push(`${streamIds[i]} 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`);
  });
  objects.push(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`);
  objects.push(`${boldId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj + "\n";
  }
  const xrefAt = Buffer.byteLength(pdf);
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
