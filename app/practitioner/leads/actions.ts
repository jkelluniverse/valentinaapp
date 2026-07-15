"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { ensureSquareCustomerForLead, sendSquareInvoice, squareConfigured } from "@/lib/square";
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

// C13-PKG §8 — sell a package right after the discovery call, before the
// portal exists for them. Charge.clientId carries the "lead:<id>" convention
// (no FK); the conversion re-points it to the real user later. A retry reuses
// the open charge, so the ledger never doubles.
export async function sendLeadPackageInvoice(leadId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const PATH = "/practitioner/leads";
  if (!squareConfigured()) redirect(`${PATH}?invoice=config`);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) redirect(PATH);

  const sku = await prisma.priceBook.findFirst({
    where: { id: String(formData.get("priceBookId") ?? ""), active: true, kind: "PACKAGE" },
  });
  if (!sku) redirect(`${PATH}?invoice=bad`);
  const note = String(formData.get("note") ?? "").trim() || null;

  const squareCustomerId = await ensureSquareCustomerForLead({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
  });
  if (!squareCustomerId) redirect(`${PATH}?invoice=square`);

  const existing = await prisma.charge.findFirst({
    where: { clientId: `lead:${lead.id}`, kind: "PACKAGE", priceBookId: sku.id, status: "DUE" },
  });
  const charge =
    existing ??
    (await prisma.charge.create({
      data: {
        clientId: `lead:${lead.id}`,
        kind: "PACKAGE",
        priceBookId: sku.id,
        description: sku.name,
        amountCents: sku.amountCents,
        currency: sku.currency,
        status: "DUE",
        dueAt: new Date(),
        lastActionById: practitioner.id,
      },
    }));

  const sent = await sendSquareInvoice({
    chargeId: charge.id,
    squareCustomerId,
    title: charge.description,
    amountCents: charge.amountCents,
    currency: charge.currency,
    note,
  });
  if (!sent.ok) {
    if (!existing) await prisma.charge.delete({ where: { id: charge.id } }).catch(() => undefined);
    redirect(`${PATH}?invoice=failed`);
  }
  await prisma.charge.update({
    where: { id: charge.id },
    data: { squareInvoiceId: sent.invoiceId, lastActionById: practitioner.id },
  });
  console.log(`[billing] lead invoice sent charge=${charge.id} lead=${lead.id} by=${practitioner.id}`);

  revalidatePath(PATH);
  redirect(`${PATH}?invoice=sent`);
}
