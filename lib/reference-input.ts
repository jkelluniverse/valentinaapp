import type Anthropic from "@anthropic-ai/sdk";

// Inspiration input for the AI studios (practitioner-only): pasted text, an
// uploaded file (PDF or image — screenshots welcome), or a web link. Returns
// Anthropic content blocks ready to precede the drafting instruction.
// Never carries client data.

const MAX_FILE_BYTES = 8 * 1024 * 1024; // stay under the server-action body cap
const MAX_URL_CHARS = 20000;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

export type ReferenceResult =
  | { ok: true; blocks: Anthropic.ContentBlockParam[]; had: boolean }
  | { ok: false; error: "file_type" | "file_size" | "url" };

function blockedHost(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "0.0.0.0" ||
    h === "[::1]"
  );
}

async function fetchUrlText(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || blockedHost(url.hostname)) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;|&\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text ? text.slice(0, MAX_URL_CHARS) : null;
  } catch {
    return null;
  }
}

// Reads `reference` (pasted text), `referenceUrl`, and `referenceFile` from
// the studio form and builds content blocks.
export async function buildReferenceBlocks(formData: FormData): Promise<ReferenceResult> {
  const blocks: Anthropic.ContentBlockParam[] = [];

  const pasted = String(formData.get("reference") ?? "").trim();
  if (pasted) {
    blocks.push({
      type: "text",
      text: `Pasted reference material (concept and structure only — write entirely original wording):\n"""\n${pasted.slice(0, MAX_URL_CHARS)}\n"""`,
    });
  }

  const rawUrl = String(formData.get("referenceUrl") ?? "").trim();
  if (rawUrl) {
    const text = await fetchUrlText(rawUrl);
    if (!text) return { ok: false, error: "url" };
    blocks.push({
      type: "text",
      text: `Reference fetched from a link the practitioner provided (concept and structure only — write entirely original wording):\n"""\n${text}\n"""`,
    });
  }

  const file = formData.get("referenceFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "file_size" };
    const type = file.type.toLowerCase();
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    if (type === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      });
      blocks.push({
        type: "text",
        text: "The attached PDF is reference material — concept and structure only; write entirely original wording.",
      });
    } else if ((IMAGE_TYPES as readonly string[]).includes(type)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: type as ImageMediaType, data },
      });
      blocks.push({
        type: "text",
        text: "The attached image (often a screenshot of a resource) is reference material — read what it shows, then use the concept and structure only; write entirely original wording.",
      });
    } else {
      return { ok: false, error: "file_type" };
    }
  }

  return { ok: true, blocks, had: blocks.length > 0 };
}

export const REFERENCE_ERRORS: Record<string, string> = {
  file_type: "That file type isn't supported — use a PDF or an image (JPG, PNG, WebP, GIF).",
  file_size: "That file is too large — keep it under 8 MB (a screenshot works well).",
  url: "That link couldn't be read — some sites (especially social media) block this. A screenshot of the post works instead.",
};
