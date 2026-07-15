"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { rateLimited } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/base-url";
import { pickLocale, deletionRequestAckEmail } from "@/lib/email-copy";
import { sendEmail } from "@/lib/notify";

// AMD-05 — client settings actions. Logs carry user id + action only.

const PATH = "/space/settings";

// Language preference — the whole portal re-renders in the chosen language on
// the next request (i18n/request.ts reads User.locale per request).
export async function saveLocale(formData: FormData) {
  const user = await requireClient();
  const raw = String(formData.get("locale") ?? "");
  const locale = raw === "es" ? "es" : "en";
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  console.info(`[settings] locale updated user=${user.id}`);
  revalidatePath("/", "layout");
  redirect(`${PATH}?saved=language`);
}

// Notification preferences — these two flags are genuinely enforced by the
// server-side senders (C13-PKG §6/§9), so the labels can be honest.
export async function saveNotifications(formData: FormData) {
  const user = await requireClient();
  const paymentRemindersMuted = formData.get("paymentReminders") !== "on";
  const renewalMessagesMuted = formData.get("renewalNotes") !== "on";
  await prisma.clientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, paymentRemindersMuted, renewalMessagesMuted },
    update: { paymentRemindersMuted, renewalMessagesMuted },
  });
  console.info(`[settings] notifications updated user=${user.id}`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=notifications`);
}

// AMD-05 B3 — "request deletion" opens a flagged task for Valentina (a human
// conversation, not a self-serve nuke) on a stated timeline: reviewed within
// 7 days, completed within 30 days of confirmation.
export async function requestDeletion(formData: FormData) {
  const user = await requireClient();
  if (rateLimited(`del:${user.id}`, 3, 60 * 60_000)) redirect(`${PATH}?error=del-rate`);

  // One live request at a time — the page shows the pending state instead.
  const pending = await prisma.deletionRequest.findFirst({
    where: { userId: user.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
  });
  if (pending) redirect(`${PATH}?saved=deletion`);

  const note = String(formData.get("note") ?? "").trim().slice(0, 2000) || null;
  await prisma.deletionRequest.create({ data: { userId: user.id, note } });
  console.info(`[settings] deletion requested user=${user.id}`);

  const practitioner = await prisma.user.findFirst({
    where: { role: "PRACTITIONER" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  if (practitioner) {
    await sendEmail({
      to: practitioner.email,
      subject: `A deletion request from ${user.name ?? user.email}`,
      text:
        `${user.name ?? user.email} has asked for their information to be deleted.` +
        (note ? `\n\nTheir note:\n${note}` : "") +
        `\n\nReview it under Settings → Deletion requests:\n${getBaseUrl()}/practitioner/settings` +
        `\n\nThe stated timeline: a response within 7 days, deletion completed within 30 days of confirmation.`,
    });
  }
  const ack = deletionRequestAckEmail(pickLocale(user.locale));
  await sendEmail({ to: user.email, subject: ack.subject, text: ack.text });

  revalidatePath(PATH);
  redirect(`${PATH}?saved=deletion`);
}
