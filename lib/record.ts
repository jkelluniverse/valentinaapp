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

export const record = {
  async append(item: RecordWrite, db: Db = prisma) {
    const { sourceType, sourceId, ...data } = item;
    await db.recordItem.upsert({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      create: { ...data, sourceType, sourceId, tags: item.tags ?? [] },
      update: { ...data, tags: item.tags ?? [] },
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
      data: patch,
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
