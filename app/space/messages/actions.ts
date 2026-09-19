"use server";

import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import {
  sendMessage,
  markRead,
  listMessageViews,
  type MessageView,
} from "@/lib/messaging";
import type { MessageRef } from "@/lib/message-refs";

// Client-side messaging actions. Scoped hard to the caller's own conversation;
// no message content is ever logged.

async function ownConversation(conversationId: string, clientId: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  return convo && convo.clientId === clientId ? convo : null;
}

function parseRefsField(formData: FormData): MessageRef[] {
  try {
    const raw = JSON.parse(String(formData.get("refs") ?? "[]"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function sendClientMessage(
  conversationId: string,
  formData: FormData,
): Promise<{ ok: boolean; crisis?: boolean; error?: string }> {
  // AMD-06 — a message sent in assist would forge the client's voice; her own
  // inbox is where she speaks as herself.
  const { blockedInAssist } = await import("@/lib/assist");
  if (await blockedInAssist("message")) return { ok: false, error: "assist" };
  const user = await requireClient();
  const convo = await ownConversation(conversationId, user.id);
  if (!convo) return { ok: false, error: "not-found" };

  const res = await sendMessage({
    conversationId,
    senderId: user.id,
    senderRole: "CLIENT",
    body: String(formData.get("body") ?? ""),
    references: parseRefsField(formData),
    excludedFromRecord: formData.get("offRecord") === "1",
    clientHasConsent: await hasConsent(user.id),
  });
  return res.ok ? { ok: true, crisis: res.crisis } : { ok: false, error: res.error };
}

export async function pollClient(conversationId: string): Promise<MessageView[]> {
  const user = await requireClient();
  const convo = await ownConversation(conversationId, user.id);
  if (!convo) return [];
  await markRead(conversationId, "CLIENT");
  return listMessageViews(conversationId, { role: "CLIENT", clientId: user.id });
}
