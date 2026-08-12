import { deflateSync } from "zlib";
import { textWidth, pdfEscape } from "@/lib/invoice-pdf";
import { decodePngToRgb } from "./png";

// C20 §4 — the sealed agreement PDF: the exact agreement text (the
// client's locale version, exactly as signed), a signature page, and an
// audit-certificate page built from the append-only event trail. Same
// hand-rolled approach as the invoice PDF (standard fonts, no deps),
// generalized to multiple pages. The drawn signature mark is embedded as
// a real image on the signature block, and the audit certificate always
// starts on its own final page.

export type SealInput = {
  title: string;
  body: string; // bodySnapshot — the exact text signed
  locale: "en" | "es";
  practiceName: string;
  signer: { name: string; at: string; ip?: string | null; agent?: string | null; drawn?: boolean; drawnPng?: string | null };
  countersigner?: { name: string; at: string; drawnPng?: string | null } | null;
  disclosure: string;
  disclosureShownAt: string | null;
  events: { at: string; kind: string; actor: string; detail?: string }[];
  agreementId: string;
  paperSigned?: boolean;
  // v3.1 — the Key Terms frozen into the sealed record, and the per-item
  // acknowledgments (initials/checkboxes) captured at signing.
  keyTerms?: [string, string][];
  acknowledgments?: { text: string; value: string; at: string }[];
  // Fillable fields the client completed before signing (already
  // substituted into `body` where the template carried markers).
  filledFields?: { label: string; value: string; at: string }[];
  // C21 — uploaded documents in this request, frozen by hash into the
  // signature certificate.
  files?: { filename: string; sha256: string; size: number }[];
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
type Block = Line | { pageBreak: true } | { image: { name: string; w: number; h: number } };

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

// Paginate blocks (text lines, forced page breaks, images) into content streams.
function paginate(blocks: Block[]): string[] {
  const pages: string[] = [];
  let y = PAGE_H - MARGIN;
  let ops: string[] = [];
  const flush = () => {
    pages.push(ops.join("\n"));
    ops = [];
    y = PAGE_H - MARGIN;
  };
  for (const block of blocks) {
    if ("pageBreak" in block) {
      // A break at the very top of a fresh page is a no-op, not a blank page.
      if (ops.length) flush();
      continue;
    }
    if ("image" in block) {
      const { name, w, h } = block.image;
      if (y - h - 8 < MARGIN && ops.length) flush();
      y -= h + 8;
      ops.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${MARGIN} ${y.toFixed(1)} cm /${name} Do Q`);
      continue;
    }
    const line = block;
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
  const lines: Block[] = [];

  // Decode the drawn marks up front so the signature blocks can embed them.
  const drawnImg = input.signer.drawnPng ? decodePngToRgb(input.signer.drawnPng) : null;
  const counterImg = input.countersigner?.drawnPng ? decodePngToRgb(input.countersigner.drawnPng) : null;
  const images: { name: string; width: number; height: number; data: Buffer }[] = [];
  if (drawnImg) {
    images.push({ name: "Sig1", width: drawnImg.width, height: drawnImg.height, data: deflateSync(drawnImg.rgb) });
  }
  if (counterImg) {
    images.push({ name: "Sig2", width: counterImg.width, height: counterImg.height, data: deflateSync(counterImg.rgb) });
  }

  // ---- Agreement text ----
  lines.push({ text: input.practiceName, size: 10, color: SLATE });
  lines.push({ text: input.title, size: 18, bold: true, color: WINE, gap: 6 });
  lines.push({ text: "", size: 6 });
  // C22 — in-document signature placement: a body may carry {{signature}}
  // / {{countersignature}} markers where the document's own signature line
  // lives; the drawn marks render THERE (matching what the signer saw),
  // and the appendix then skips the duplicate images. The heading above
  // already carries the title — drop the body's duplicate first line.
  const bodyLines = input.body.split("\n");
  const pdfBody =
    bodyLines[0]?.trim().toLowerCase() === input.title.trim().toLowerCase()
      ? bodyLines.slice(1).join("\n").replace(/^\n+/, "")
      : input.body;
  const placedInline = /\{\{(signature|countersignature)\}\}/.test(pdfBody);
  for (const seg of pdfBody.split(/(\{\{signature\}\}|\{\{countersignature\}\})/g)) {
    if (seg === "{{signature}}" || seg === "{{countersignature}}") {
      const img = seg === "{{signature}}" ? drawnImg : counterImg;
      const name = seg === "{{signature}}" ? "Sig1" : "Sig2";
      if (img) {
        const scale = Math.min(190 / img.width, 60 / img.height, 1);
        lines.push({ image: { name, w: img.width * scale, h: img.height * scale } });
      } else {
        lines.push({ text: seg === "{{signature}}" ? `/s/ ${input.signer.name}` : input.countersigner ? `/s/ ${input.countersigner.name}` : "", size: 11, bold: true });
      }
      continue;
    }
    for (const l of wrapText(seg, 10.5, BODY_W)) lines.push({ text: l, size: 10.5 });
  }

  // ---- Key Terms (v3.1 — "captured in the sealed record") ----
  if (input.keyTerms?.length) {
    lines.push({ text: "", size: 10, gap: 20 });
    lines.push({ text: input.locale === "es" ? "TÉRMINOS CLAVE (registro sellado)" : "KEY TERMS (sealed record)", size: 13, bold: true, color: WINE, gap: 8 });
    for (const [label, value] of input.keyTerms) {
      lines.push({ text: `${label}:  ${value}`, size: 9.5 });
    }
  }

  // ---- Acknowledgments (v3.1 — initials/checkboxes, attributed) ----
  if (input.acknowledgments?.length) {
    lines.push({ text: "", size: 10, gap: 16 });
    lines.push({ text: input.locale === "es" ? "RECONOCIMIENTOS INICIALADOS" : "INITIALED ACKNOWLEDGMENTS", size: 13, bold: true, color: WINE, gap: 8 });
    for (const ack of input.acknowledgments) {
      lines.push({ text: `[${ack.value}]  ${ack.at}`, size: 9, bold: true, gap: 4 });
      for (const l of wrapText(ack.text, 8.5, BODY_W)) lines.push({ text: l, size: 8.5, color: SLATE });
    }
  }

  // ---- Documents in this request (C21 uploads), frozen by hash ----
  if (input.files?.length) {
    lines.push({ text: "", size: 10, gap: 16 });
    lines.push({ text: input.locale === "es" ? "DOCUMENTOS DE ESTA SOLICITUD (sellados por hash)" : "DOCUMENTS IN THIS REQUEST (sealed by hash)", size: 13, bold: true, color: WINE, gap: 8 });
    for (const f of input.files) {
      lines.push({ text: f.filename, size: 9.5, bold: true, gap: 3 });
      lines.push({ text: `SHA-256 ${f.sha256} · ${(f.size / 1024).toFixed(1)} KB`, size: 8, color: SLATE });
    }
  }

  // ---- Fields the client completed (attributed; values also live inline
  // in the document text above) ----
  if (input.filledFields?.length) {
    lines.push({ text: "", size: 10, gap: 16 });
    lines.push({ text: input.locale === "es" ? "CAMPOS COMPLETADOS POR EL CLIENTE" : "CLIENT-COMPLETED FIELDS", size: 13, bold: true, color: WINE, gap: 8 });
    for (const f of input.filledFields) {
      lines.push({ text: `${f.label}  ·  ${f.at}`, size: 9, bold: true, gap: 4 });
      for (const l of wrapText(f.value, 9.5, BODY_W)) lines.push({ text: l, size: 9.5 });
    }
  }

  // ---- Signature page ----
  lines.push({ text: "", size: 10, gap: 24 });
  lines.push({ text: t.sigPage, size: 13, bold: true, color: WINE, gap: 10 });
  lines.push({ text: `${t.signedBy}: ${input.signer.name}`, size: 11, bold: true, gap: 6 });
  lines.push({ text: `${input.signer.at}${input.signer.ip ? ` · IP ${input.signer.ip}` : ""}`, size: 9.5, color: SLATE });
  if (input.signer.agent) for (const l of wrapText(input.signer.agent, 8.5, BODY_W)) lines.push({ text: l, size: 8.5, color: SLATE });
  if (drawnImg && !placedInline) {
    // The mark itself, scaled to a signature-sized box (aspect preserved).
    const scale = Math.min(210 / drawnImg.width, 68 / drawnImg.height, 1);
    lines.push({ text: "", size: 2 });
    lines.push({ image: { name: "Sig1", w: drawnImg.width * scale, h: drawnImg.height * scale } });
  } else if (input.signer.drawn && !placedInline) {
    lines.push({ text: t.drawnNote, size: 9.5, color: SLATE, gap: 2 });
  }
  if (input.paperSigned) lines.push({ text: t.paperNote, size: 9.5, color: SLATE, gap: 2 });
  if (input.countersigner) {
    lines.push({ text: `${t.counterBy}: ${input.countersigner.name}`, size: 11, bold: true, gap: 8 });
    lines.push({ text: input.countersigner.at, size: 9.5, color: SLATE });
    if (counterImg && !placedInline) {
      const scale = Math.min(210 / counterImg.width, 68 / counterImg.height, 1);
      lines.push({ text: "", size: 2 });
      lines.push({ image: { name: "Sig2", w: counterImg.width * scale, h: counterImg.height * scale } });
    }
  }
  lines.push({ text: t.disclosure, size: 10, bold: true, gap: 14 });
  if (input.disclosureShownAt) lines.push({ text: input.disclosureShownAt, size: 9, color: SLATE });
  for (const l of wrapText(input.disclosure, 9, BODY_W)) lines.push({ text: l, size: 9, color: SLATE });

  // ---- Audit certificate — always its own final page(s), never split
  // awkwardly off the signature block ----
  lines.push({ pageBreak: true });
  lines.push({ text: t.audit, size: 13, bold: true, color: WINE, gap: 8 });
  lines.push({ text: t.auditLede, size: 9.5, color: SLATE, gap: 4 });
  for (const e of input.events) {
    lines.push({ text: `${e.at}  ·  ${e.kind}  ·  ${e.actor}${e.detail ? `  ·  ${e.detail}` : ""}`, size: 9 });
  }
  lines.push({ text: `${t.docId}: ${input.agreementId}`, size: 8.5, color: SLATE, gap: 10 });

  const pageStreams = paginate(lines);

  // ---- Assemble the PDF object graph ----
  // The final buffer is latin1 (byte-per-char), so all offsets/lengths are
  // measured in latin1 too — required now that image streams carry binary.
  const objects: string[] = [];
  const n = pageStreams.length;
  // 1 catalog, 2 pages, 3..(2+n) page objs, then n streams, 2 fonts, then images
  const pageIds = pageStreams.map((_, i) => 3 + i);
  const streamIds = pageStreams.map((_, i) => 3 + n + i);
  const fontId = 3 + 2 * n;
  const boldId = fontId + 1;
  const imageIds = images.map((_, i) => boldId + 1 + i);
  const xobjects = images.length
    ? ` /XObject << ${images.map((img, i) => `/${img.name} ${imageIds[i]} 0 R`).join(" ")} >>`
    : "";

  objects.push(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`);
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >> endobj`);
  pageStreams.forEach((_, i) => {
    objects.push(
      `${pageIds[i]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >>${xobjects} >> >> endobj`
    );
  });
  pageStreams.forEach((stream, i) => {
    objects.push(`${streamIds[i]} 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`);
  });
  objects.push(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`);
  objects.push(`${boldId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`);
  images.forEach((img, i) => {
    objects.push(
      `${imageIds[i]} 0 obj << /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.data.length} >> stream\n${img.data.toString("latin1")}\nendstream endobj`
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += obj + "\n";
  }
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
