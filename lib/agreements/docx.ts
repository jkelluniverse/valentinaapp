import { inflateRawSync } from "zlib";
import type { InitialItem } from "./index";

// C21.1 — turn an uploaded Word document into a fillable signing page.
// A .docx is a ZIP holding word/document.xml; this is the minimal reader
// (no deps, same spirit as the PNG decoder): find the entry, inflate it,
// and flatten the XML to verbatim paragraph text. Field authoring is then
// plain-English:
//   [[text: Full legal name]]  [[textarea: Anything else]]
//   [[initials: I have read section 3]]  [[checkbox: I agree]]
// …and runs of underscores (____) are detected as blanks automatically,
// labeled from the words just before them. text/textarea fields render
// INLINE where they sit (as {{fill:*}} markers); initials/checkboxes move
// to the acknowledgments list.

function findDocumentXml(bytes: Buffer): Buffer | null {
  // End of Central Directory: scan back for PK\x05\x06.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = bytes.readUInt16LE(eocd + 10);
  let off = bytes.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (bytes.readUInt32LE(off) !== 0x02014b50) return null;
    const method = bytes.readUInt16LE(off + 10);
    const compSize = bytes.readUInt32LE(off + 20);
    const nameLen = bytes.readUInt16LE(off + 28);
    const extraLen = bytes.readUInt16LE(off + 30);
    const commentLen = bytes.readUInt16LE(off + 32);
    const localOff = bytes.readUInt32LE(off + 42);
    const name = bytes.toString("latin1", off + 46, off + 46 + nameLen);
    if (name === "word/document.xml") {
      // Local header: sizes of name/extra can differ from the central copy.
      if (bytes.readUInt32LE(localOff) !== 0x04034b50) return null;
      const lNameLen = bytes.readUInt16LE(localOff + 26);
      const lExtraLen = bytes.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compSize);
      try {
        return method === 0 ? Buffer.from(data) : inflateRawSync(data);
      } catch {
        return null;
      }
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// The document's text, verbatim, one line per paragraph.
export function extractDocxText(bytes: Buffer): string | null {
  const xml = findDocumentXml(bytes)?.toString("utf8");
  if (!xml) return null;
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paras.map((p) => {
    const withBreaks = p.replace(/<w:br\s*\/>/g, "\n").replace(/<w:tab\s*\/>/g, " ");
    const texts = withBreaks.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
    return decodeEntities(texts.map((t) => t.replace(/^<w:t[^>]*>/, "").replace(/<\/w:t>$/, "")).join(""));
  });
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

function slugId(label: string, taken: Set<string>, fallback: string): string {
  let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || fallback;
  while (taken.has(id)) id = `${id}-2`;
  taken.add(id);
  return id;
}

// Parse field authoring out of plain document text: bracket tokens first,
// then bare underscore blanks. Returns the body with {{fill:*}} markers in
// place and the item list to store on the template.
export function parseAuthoredFields(text: string): { body: string; items: InitialItem[] } {
  const items: InitialItem[] = [];
  const taken = new Set<string>();

  let body = text.replace(
    /\[\[\s*(text|textarea|initials|checkbox)\s*:\s*([^\]]+?)\s*\]\]/gi,
    (_, kindWord: string, label: string) => {
      const kind = kindWord.toLowerCase();
      const id = slugId(label, taken, `field-${items.length + 1}`);
      if (kind === "initials" || kind === "checkbox") {
        items.push({ id, text: label, kind: kind as "initials" | "checkbox", required: true });
        return ""; // acknowledgments render in their own list, not inline
      }
      items.push({ id, text: label, kind: "text", required: true, ...(kind === "textarea" ? { multiline: true } : {}) });
      return `{{fill:${id}}}`;
    }
  );

  // Blanks: 3+ underscores → a field, labeled from the words just before.
  let blankN = 0;
  body = body.replace(/_{3,}/g, (run: string, offset: number) => {
    blankN++;
    const before = body.slice(Math.max(0, offset - 60), offset);
    const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
    const label =
      lineBefore.replace(/[\s:;,.—–-]+$/, "").trim().split(/\s+/).slice(-6).join(" ") || `Blank ${blankN}`;
    const id = slugId(label, taken, `blank-${blankN}`);
    items.push({ id, text: label, kind: "text", required: true, ...(run.length >= 40 ? { multiline: true } : {}) });
    return `{{fill:${id}}}`;
  });

  return { body, items };
}

// The whole conversion: docx bytes → a fillable TEXT-template body + items.
export function convertDocxToFillable(bytes: Buffer): { body: string; items: InitialItem[] } | null {
  const text = extractDocxText(bytes);
  if (!text) return null;
  return parseAuthoredFields(text);
}
