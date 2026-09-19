import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Web Push (VAPID). Notifications are a tap on the shoulder, never a data
// channel: payloads carry a short title/body and a destination path — no
// message content, no health material (same privacy posture as email
// notifications, C15 §9). Degrades to a no-op when keys are unset; a failed
// push never fails the action that triggered it.

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@valentinavelez.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url: string; // in-app destination, e.g. "/space/messages"
};

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            { TTL: 3600 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The device revoked or lost the subscription — prune quietly.
          if (status === 404 || status === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
          }
        }
      }),
    );
    console.log(`[push] sent user=${userId} devices=${subs.length}`);
  } catch {
    console.error(`[push] send failed user=${userId}`);
  }
}
