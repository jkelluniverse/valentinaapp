import type { Prisma, PrismaClient, RecordKind, LogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { entryTypeLabel } from "@/lib/entry-meta";

// The record service (C4 spec §5): the ONLY code that writes RecordItem.
// Append/update are upserts keyed on (sourceType, sourceId), so every call is
// idempotent — re-running a write (or the backfill) can never duplicate.
// Pass the transaction client from the caller to keep source row + record
// item in lock-step.

type Db = PrismaClient | Prisma.TransactionClient;

export const SUMMARY_LENGTH = 280;

export function snapshot(text: string | null | undefined) {
  if (!text) return null;
  const t = text.trim();
  return t.length > SUMMARY_LENGTH ? `${t.slice(0, SUMMARY_LENGTH).trimEnd()}…` : t;
}

export type RecordWrite = {
  clientId: string;
  kind: RecordKind;
  occurredAt: Date;
  title?: string | null;
  summary?: string | null;
  mood?: number | null;
  tags?: string[];
  sourceType: string;
  sourceId: string;
};

// AMD-05 A2 — a tiny language SIGNAL, never a gate. Stored on every record
// item so later features (and Valentina's eye) can see which language a client
// reflects in; zero behavior depends on it. Deliberately humble: marker
// characters + a handful of high-frequency words. Code-switching is normal and
// welcome — both signals present is simply "mixed".
const ES_MARKERS = /[¿¡ñáéíóúü]/i;
const ES_WORDS = new Set([
  "como", "pero", "siento", "estoy", "muy", "porque", "que", "para", "con",
  "una", "esto", "cuando", "todo", "nada", "tengo", "bien", "hoy", "más",
  "también", "aunque", "desde", "sobre", "entre", "ser", "estar",
]);
const EN_WORDS = new Set([
  "the", "and", "but", "with", "that", "this", "have", "was", "for", "not",
  "are", "you", "very", "because", "when", "feel", "feeling", "just", "really",
  "about", "what", "today", "from", "been", "were",
]);

export function detectLanguage(text: string | null | undefined): "es" | "en" | "mixed" | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t.length < 12) return null; // too short to say anything honest
  const words = t.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 3) return null;
  let es = ES_MARKERS.test(t) ? 1 : 0;
  let en = 0;
  for (const w of words) {
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
  }
  if (es > 0 && en > 0) return "mixed";
  if (es > 0) return "es";
  if (en > 0) return "en";
  return null;
}

export const record = {
  async append(item: RecordWrite, db: Db = prisma) {
    const { sourceType, sourceId, ...data } = item;
    const detectedLanguage = detectLanguage(item.summary);
    await db.recordItem.upsert({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      create: { ...data, sourceType, sourceId, tags: item.tags ?? [], detectedLanguage },
      update: { ...data, tags: item.tags ?? [], detectedLanguage },
    });
  },

  async update(
    sourceType: string,
    sourceId: string,
    patch: Partial<Omit<RecordWrite, "sourceType" | "sourceId" | "clientId" | "kind">>,
    db: Db = prisma,
  ) {
    await db.recordItem.updateMany({
      where: { sourceType, sourceId },
      // When the text changes, the language signal refreshes with it.
      data: "summary" in patch ? { ...patch, detectedLanguage: detectLanguage(patch.summary) } : patch,
    });
  },

  async remove(sourceType: string, sourceId: string, db: Db = prisma) {
    await db.recordItem.deleteMany({ where: { sourceType, sourceId } });
  },
};

// Mappers: one place that knows how a source row becomes a timeline snapshot.

export function logEntryToRecord(entry: LogEntry): RecordWrite {
  return {
    clientId: entry.clientId,
    kind: "LOG_ENTRY",
    occurredAt: entry.occurredAt,
    title: entryTypeLabel(entry.type),
    summary: snapshot(entry.body),
    mood: entry.mood,
    tags: entry.tags,
    sourceType: "LogEntry",
    sourceId: entry.id,
  };
}

export function promptResponseToRecord(args: {
  responseId: string;
  clientId: string;
  promptTitle: string;
  completedAt: Date;
  body: string | null;
  mood: number | null;
}): RecordWrite {
  return {
    clientId: args.clientId,
    kind: "PROMPT_RESPONSE",
    occurredAt: args.completedAt,
    title: args.promptTitle,
    summary: snapshot(args.body) ?? "Checked in",
    mood: args.mood,
    tags: [],
    sourceType: "PromptResponse",
    sourceId: args.responseId,
  };
}
