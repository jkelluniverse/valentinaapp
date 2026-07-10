"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";

// Manual assignment (C3 spec §3 default). Recurring delivery is deferred —
// scheduleRule stays null until the scheduler pass.
export async function assignPrompt(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/clients");

  const promptId = String(formData.get("promptId") ?? "");
  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, active: true },
    select: { id: true },
  });
  const back = `/practitioner/clients/${clientId}`;
  if (!prompt) redirect(`${back}?error=prompt`);

  const rawDue = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = rawDue ? new Date(rawDue) : null;
  const dueAt = parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue : null;

  await prisma.assignment.create({
    data: {
      promptId: prompt.id,
      clientId: client.id,
      assignedById: practitioner.id,
      dueAt,
    },
  });

  revalidatePath(back);
  redirect(`${back}?sent=1`);
}

// Assign a worksheet (C9) — same manual pattern as prompts.
export async function assignWorksheet(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/clients");

  const worksheetId = String(formData.get("worksheetId") ?? "");
  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, active: true },
    select: { id: true },
  });
  const back = `/practitioner/clients/${clientId}`;
  if (!worksheet) redirect(`${back}?error=prompt`);

  const rawDue = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = rawDue ? new Date(rawDue) : null;
  const dueAt = parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue : null;

  await prisma.worksheetAssignment.create({
    data: {
      worksheetId: worksheet.id,
      clientId: client.id,
      assignedById: practitioner.id,
      dueAt,
    },
  });

  revalidatePath(back);
  redirect(`${back}?sent=1`);
}
