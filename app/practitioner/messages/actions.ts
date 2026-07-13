"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import {
  getOrCreateConversation,
  sendMessage,
  markRead,
  listMessageViews,
  setConversationStatus,
  clearSafetyFlag,
  AWAY_NOTE_KEY,
  type MessageView,
} from "@/lib/messaging";
import type { MessageRef } from "@/lib/message-refs";

// Practitioner messaging actions. The single practitioner may message any
// client; each call is scoped to that client's one conversation.

function parseRefsField(formData: FormData): MessageRef[] {
  try {
    const raw = JSON.parse(String(formData.get("refs") ?? "[]"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function sendPractitionerMessage(
  clientId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const practitioner = await requirePractitioner();
  const convo = await getOrCreateConversation(clientId);
  if (!convo) return { ok: false, error: "not-found" };

  const res = await sendMessage({
    conversationId: convo.id,
    senderId: practitioner.id,
    senderRole: "PRACTITIONER",
    body: String(formData.get("body") ?? ""),
    references: parseRefsField(formData),
    excludedFromRecord: formData.get("offRecord") === "1",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function pollPractitioner(clientId: string): Promise<MessageView[]> {
  await requirePractitioner();
  const convo = await prisma.conversation.findUnique({ where: { clientId } });
  if (!convo) return [];
  await markRead(convo.id, "PRACTITIONER");
  return listMessageViews(convo.id, { role: "PRACTITIONER", clientId });
}

export async function pauseThread(clientId: string, pause: boolean) {
  await requirePractitioner();
  await getOrCreateConversation(clientId);
  await setConversationStatus(clientId, pause ? "PAUSED" : "ACTIVE");
  revalidatePath(`/practitioner/messages/${clientId}`);
  redirect(`/practitioner/messages/${clientId}`);
}

export async function acknowledgeFlag(clientId: string, messageId: string) {
  await requirePractitioner();
  await clearSafetyFlag(messageId);
  revalidatePath("/practitioner/messages");
  revalidatePath(`/practitioner/messages/${clientId}`);
  redirect(`/practitioner/messages/${clientId}`);
}

export async function saveAwayNote(formData: FormData) {
  await requirePractitioner();
  const value = String(formData.get("awayNote") ?? "").trim();
  if (value) {
    await prisma.practiceSetting.upsert({
      where: { key: AWAY_NOTE_KEY },
      create: { key: AWAY_NOTE_KEY, value },
      update: { value },
    });
  } else {
    await prisma.practiceSetting.deleteMany({ where: { key: AWAY_NOTE_KEY } });
  }
  revalidatePath("/practitioner/messages");
  redirect("/practitioner/messages?saved=1");
}
