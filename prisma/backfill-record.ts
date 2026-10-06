import { PrismaClient } from "@prisma/client";
import { record, logEntryToRecord, promptResponseToRecord } from "../lib/record";

// C4.3 backfill: bring pre-C4 entries and prompt responses into RecordItem.
// Idempotent (the service upserts on sourceType+sourceId), so it's safe to
// re-run any time — it also serves as a drift re-sync tool.
// Counts only in output; never any content (spec §8).

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.logEntry.findMany();
  for (const entry of entries) {
    await record.append(logEntryToRecord(entry), prisma);
  }
  console.log(`Backfilled ${entries.length} log entries`);

  const responses = await prisma.promptResponse.findMany({
    include: {
      assignment: { select: { clientId: true, prompt: { select: { title: true } } } },
    },
  });
  for (const r of responses) {
    await record.append(
      promptResponseToRecord({
        responseId: r.id,
        clientId: r.assignment.clientId,
        promptTitle: r.assignment.prompt.title,
        completedAt: r.completedAt,
        body: r.body,
        mood: r.mood,
      }),
      prisma,
    );
  }
  console.log(`Backfilled ${responses.length} prompt responses`);

  const total = await prisma.recordItem.count();
  console.log(`RecordItem total: ${total} (sources: ${entries.length + responses.length})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
