"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { createInvite } from "@/app/practitioner/clients/actions";

// C18 §5 — the conversion bridge. Pre-fills the C1 invite with the lead's name +
// email and returns the one-time link. Acceptance (matched by email) flips the
// lead to CONVERTED with linkage (app/invite/[token]/actions.ts).
export async function inviteLeadAsClient(
  leadId: string,
): Promise<{ ok: true; link?: string; error?: string } | { ok: false; error: string }> {
  await requirePractitioner();
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found." };

  const result = await createInvite({ name: lead.name, email: lead.email });
  revalidatePath("/practitioner/leads");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, link: result.link };
}

// C18 §5 — quiet lifecycle nudges without CRM sprawl.
export async function setLeadStatus(leadId: string, status: "COMPLETED" | "CLOSED"): Promise<void> {
  await requirePractitioner();
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  revalidatePath("/practitioner/leads");
}
