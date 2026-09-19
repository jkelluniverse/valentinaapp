// Everything a payment email needs about a charge, assembled in one place:
// who to write to (client and/or payee), where they pay (the Square-hosted
// invoice when one exists, otherwise the in-portal payment sheet), and the
// PDF invoice attachment. Used by the invoice send, the manual "Remind", and
// the payee copy — so all of them stay consistent.

import type { Charge } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/billing";
import { getSquareCustomer } from "@/lib/square";
import { pickLocale, type Locale } from "@/lib/email-copy";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export type ChargeEmailContext = {
  client: { email: string; name: string | null; locale: Locale } | null;
  payee: { name: string; email: string } | null;
  /** Square-hosted invoice page when one exists, else the in-portal pay sheet. */
  payUrl: string | null;
  amount: string;
  dueDateText: string | null;
  attachment: { filename: string; contentBase64: string; contentType: string };
};

function formatDay(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export async function chargeEmailContext(
  charge: Charge,
  baseUrl: string,
  opts: { note?: string | null } = {},
): Promise<ChargeEmailContext> {
  const isLead = charge.clientId.startsWith("lead:");
  const [user, lead] = await Promise.all([
    isLead
      ? null
      : prisma.user.findUnique({
          where: { id: charge.clientId },
          select: {
            email: true,
            name: true,
            locale: true,
            profile: { select: { payeeName: true, payeeEmail: true } },
          },
        }),
    isLead
      ? prisma.lead.findUnique({
          where: { id: charge.clientId.slice("lead:".length) },
          select: { name: true, email: true },
        })
      : null,
  ]);

  const locale = pickLocale(user?.locale);
  const client = user
    ? { email: user.email, name: user.name, locale }
    : lead
      ? { email: lead.email, name: lead.name, locale: "en" as Locale }
      : null;
  const payee =
    user?.profile?.payeeEmail && user.profile.payeeName
      ? { name: user.profile.payeeName, email: user.profile.payeeEmail }
      : null;

  // Leads have no portal — their only pay path is the Square-hosted invoice.
  const payUrl =
    charge.squareInvoiceUrl ??
    (isLead ? null : `${baseUrl}/space/schedule/pay/${charge.id}`);

  // Billing address, live from Square when the client is linked there.
  const link = isLead
    ? null
    : await prisma.squareCustomerLink.findUnique({ where: { clientId: charge.clientId } });
  const sqProfile = link ? await getSquareCustomer(link.squareCustomerId) : null;

  const billedToLines = [
    client?.name ?? "—",
    ...(payee ? [`c/o ${payee.name}`] : []),
    client?.email ?? "",
    ...(sqProfile?.addressLine1
      ? [
          [sqProfile.addressLine1, sqProfile.addressLine2].filter(Boolean).join(", "),
          [sqProfile.city, sqProfile.state, sqProfile.postalCode].filter(Boolean).join(", "),
        ]
      : []),
  ].filter(Boolean);

  const amount = formatMoney(charge.amountCents, charge.currency);
  const dueDateText = charge.dueAt ? formatDay(charge.dueAt, locale) : null;

  const pdf = renderInvoicePdf({
    locale,
    invoiceNumber: charge.id.slice(-8).toUpperCase(),
    issuedDate: formatDay(charge.createdAt, locale),
    dueDate: dueDateText,
    billedToLines,
    description: charge.description,
    amount,
    note: opts.note ?? null,
    payUrl,
  });

  return {
    client,
    payee,
    payUrl,
    amount,
    dueDateText,
    attachment: {
      filename: pdf.filename,
      contentBase64: pdf.base64,
      contentType: "application/pdf",
    },
  };
}
