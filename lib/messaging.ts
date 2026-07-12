import type { SenderRole, ConvoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { record, snapshot } from "@/lib/record";
import { sendEmail } from "@/lib/notify";
import { isCrisisSignal } from "@/lib/message-safety";
import { parseRefs, resolveRefs, type MessageRef, type ResolvedRef } from "@/lib/message-refs";

export type MessageView = {
  id: string;
  role: SenderRole;
  body: string;
  refs: ResolvedRef[];
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  safetyFlag: boolean;
  excludedFromRecord: boolean;
};

// Serializable, viewer-scoped message list for the thread (refs resolved live).
export async function listMessageViews(
  conversationId: string,
  viewer: { role: "CLIENT" | "PRACTITIONER"; clientId: string },
): Promise<MessageView[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const views: MessageView[] = [];
  for (const m of messages) {
    const refs = m.references ? await resolveRefs(parseRefs(m.references), viewer) : [];
    views.push({
      id: m.id,
      role: m.senderRole,
      body: m.body,
      refs,
      createdAt: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      safetyFlag: m.safetyFlag,
      excludedFromRecord: m.excludedFromRecord,
    });
  }
  return views;
}

// C15 — the messaging service. Message content is among the most sensitive data
// in the app: it never enters logs (metadata only), reads are conversation-
// scoped, and a client message feeds the psyche net (C4) only with consent and
// only when it isn't marked "just between us".

export const AWAY_NOTE_KEY = "messagesAwayNote";
export const RESPONSE_RHYTHM = "Valentina usually replies within a day.";

export async function getPractitionerId(): Promise<string | null> {
  const p = await prisma.user.findFirst({
    where: { role: "PRACTITIONER" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return p?.id ?? null;
}

// The single thread for a client (created on first open). One per client, ever.
export async function getOrCreateConversation(clientId: string) {
  const existing = await prisma.conversation.findUnique({ where: { clientId } });
  if (existing) return existing;
  const practitionerId = await getPractitionerId();
  if (!practitionerId) return null;
  return prisma.conversation.create({ data: { clientId, practitionerId } });
}

export async function getAwayNote(): Promise<string | null> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: AWAY_NOTE_KEY } });
  return row?.value?.trim() || null;
}

export type SendResult =
  | { ok: true; messageId: string; crisis: boolean }
  | { ok: false; error: "empty" | "paused" | "not-found" };

// Send a message. senderRole decides record-feeding and the safety screen.
export async function sendMessage(args: {
  conversationId: string;
  senderId: string;
  senderRole: SenderRole;
  body: string;
  references?: MessageRef[];
  excludedFromRecord?: boolean;
  clientHasConsent?: boolean;
}): Promise<SendResult> {
  const body = args.body.trim();
  const refs = parseRefs(args.references ?? []);
  if (!body && refs.length === 0) return { ok: false, error: "empty" };

  const convo = await prisma.conversation.findUnique({ where: { id: args.conversationId } });
  if (!convo) return { ok: false, error: "not-found" };
  // A paused thread accepts nothing until she reopens it (a held boundary).
  if (convo.status === "PAUSED") return { ok: false, error: "paused" };

  // Duty of care: screen CLIENT messages for crisis signals (instant, no
  // network) so support can be offered immediately and she's flagged.
  const crisis = args.senderRole === "CLIENT" && isCrisisSignal(body);

  const message = await prisma.message.create({
    data: {
      conversationId: convo.id,
      senderId: args.senderId,
      senderRole: args.senderRole,
      body,
      references: refs.length ? (refs as object) : undefined,
      excludedFromRecord: Boolean(args.excludedFromRecord),
      safetyFlag: crisis,
      deliveredAt: new Date(), // persisted = delivered (async by nature)
    },
  });

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { lastMessageAt: message.createdAt },
  });

  // Psyche net (C4): a client's own expression, unless off-record, and only
  // with record consent. Hers is thread context, never client-expression.
  if (
    args.senderRole === "CLIENT" &&
    !args.excludedFromRecord &&
    args.clientHasConsent
  ) {
    await record.append({
      clientId: convo.clientId,
      kind: "MESSAGE",
      occurredAt: message.createdAt,
      title: "Message",
      summary: snapshot(body),
      tags: [],
      sourceType: "Message",
      sourceId: message.id,
    });
  }

  await notifyRecipient(convo.clientId, args.senderRole).catch(() => {});

  return { ok: true, messageId: message.id, crisis };
}

// Gentle notification — never any message content (privacy §9).
async function notifyRecipient(clientId: string, senderRole: SenderRole) {
  const [client, practitioner] = await Promise.all([
    prisma.user.findUnique({ where: { id: clientId }, select: { name: true, email: true } }),
    prisma.user.findFirst({ where: { role: "PRACTITIONER" }, select: { email: true } }),
  ]);
  if (senderRole === "CLIENT") {
    if (practitioner?.email) {
      await sendEmail({
        to: practitioner.email,
        subject: `A message from ${client?.name || client?.email || "a client"}`,
        text: "You have a new message waiting in their space. Open Veritas to read and reply.",
      });
    }
  } else if (client?.email) {
    await sendEmail({
      to: client.email,
      subject: "A note from Valentina",
      text: "Valentina left you a message in your space. Open Veritas whenever you're ready.",
    });
  }
}

// Mark the OTHER party's messages as read when a viewer opens the thread.
export async function markRead(conversationId: string, viewerRole: SenderRole) {
  const other: SenderRole = viewerRole === "CLIENT" ? "PRACTITIONER" : "CLIENT";
  await prisma.message.updateMany({
    where: { conversationId, senderRole: other, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function setConversationStatus(clientId: string, status: ConvoStatus) {
  await prisma.conversation.update({ where: { clientId }, data: { status } });
}

export async function clearSafetyFlag(messageId: string) {
  await prisma.message.update({ where: { id: messageId }, data: { safetyCleared: true } });
}
