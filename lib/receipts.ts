// EMAIL-SPEC #12 — our warm receipt when a payment lands (in-portal, invoice,
// or reconciled later). Shared by the Square webhook and the jobs tick.
// Lead-keyed charges skip it (no account; Square's page confirms).

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notify";
import { pickLocale, receiptEmail } from "@/lib/email-copy";
import { formatMoney } from "@/lib/billing";

export async function sendReceiptForCharge(charge: {
  clientId: string;
  description: string;
  amountCents: number;
  currency: string;
}): Promise<void> {
  try {
    if (charge.clientId.startsWith("lead:")) return;
    const client = await prisma.user.findUnique({
      where: { id: charge.clientId },
      select: { email: true, locale: true },
    });
    if (!client?.email) return;
    const mail = receiptEmail(pickLocale(client.locale), {
      description: charge.description,
      amount: formatMoney(charge.amountCents, charge.currency),
    });
    await sendEmail({ to: client.email, subject: mail.subject, text: mail.text });
  } catch {
    console.error("[receipts] receipt email failed");
  }
}
