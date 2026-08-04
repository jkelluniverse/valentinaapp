import { prisma } from "@/lib/prisma";
import { generateInviteToken, hashToken } from "@/lib/invites";
import type { Prisma } from "@prisma/client";

// C20-AGREEMENTS — the service layer. States: DRAFT → SENT → VIEWED →
// SIGNED → (DECLINED / EXPIRED / VOIDED). Voiding is the practitioner's,
// attributed, and never deletes history; the event trail is append-only
// and becomes the sealed PDF's audit certificate (§4).
//
// 🟡 STANDING FLAG (§6.1): every starter text below is a fixture-grade
// placeholder. The attorney blesses agreement texts + the e-records
// disclosure before ANY real use — the machinery is ours; the words are law.

export const AGREEMENT_LINK_TTL_DAYS = 30;

// §3.2 — the ESIGN consumer-consent line (placeholder wording, attorney
// pass pending). Shown before signing, timestamped when shown.
export const E_RECORDS_DISCLOSURE: Record<string, string> = {
  en: "[PLACEHOLDER — attorney review required] By continuing, you agree to receive and sign this document electronically. You may request a paper copy at any time, and signing electronically has the same effect as signing on paper.",
  es: "[MARCADOR — requiere revisión legal] Al continuar, acepta recibir y firmar este documento electrónicamente. Puede solicitar una copia en papel en cualquier momento; la firma electrónica tiene el mismo efecto que la firma en papel.",
};

// §1 — the starter set, en/es siblings, clearly marked placeholders.
const STARTER: { slug: string; requiresCountersign: boolean; titles: Record<string, string>; bodies: Record<string, string> }[] = [
  {
    slug: "client-services",
    requiresCountersign: true,
    titles: { en: "Client Services Agreement", es: "Acuerdo de servicios" },
    bodies: {
      en: "[PLACEHOLDER TEXT — not for real use until attorney review]\n\nThis Client Services Agreement is between {{practitioner_name}} and {{client_name}}, dated {{date}}.\n\n1. Services. The practitioner will provide the services described in your program.\n2. Confidentiality. What you share stays between you, within the limits of the law.\n3. Scheduling. Sessions follow the practice's scheduling and cancellation policy.\n4. Term. This agreement remains in effect until ended by either of us in writing.",
      es: "[TEXTO MARCADOR — no usar hasta revisión legal]\n\nEste Acuerdo de servicios es entre {{practitioner_name}} y {{client_name}}, con fecha {{date}}.\n\n1. Servicios. La practicante brindará los servicios descritos en su programa.\n2. Confidencialidad. Lo que compartas queda entre ustedes, dentro de los límites de la ley.\n3. Sesiones. Las sesiones siguen la política de agenda y cancelación de la práctica.\n4. Vigencia. Este acuerdo permanece vigente hasta que cualquiera lo termine por escrito.",
    },
  },
  {
    slug: "scope-of-work",
    requiresCountersign: true,
    titles: { en: "Scope of Work / Package Agreement", es: "Alcance de trabajo / Acuerdo de paquete" },
    bodies: {
      en: "[PLACEHOLDER TEXT — not for real use until attorney review]\n\n{{client_name}} and {{practitioner_name}} agree to the program \"{{package_name}}\" at {{price}}, for {{term}}, beginning {{date}}.\n\nWhat's included, session cadence, and completion terms are as described in the program.",
      es: "[TEXTO MARCADOR — no usar hasta revisión legal]\n\n{{client_name}} y {{practitioner_name}} acuerdan el programa \"{{package_name}}\" por {{price}}, durante {{term}}, a partir de {{date}}.\n\nLo incluido, el ritmo de sesiones y los términos de cierre son los descritos en el programa.",
    },
  },
  {
    slug: "recording-addendum",
    requiresCountersign: false,
    titles: { en: "Recording Addendum", es: "Anexo de grabación" },
    bodies: {
      en: "[PLACEHOLDER TEXT — not for real use until attorney review]\n\nThis addendum, between {{practitioner_name}} and {{client_name}} dated {{date}}, pairs with your recording consent: sessions may be recorded for note-taking, recordings are handled per the practice's privacy terms, and you may withdraw consent at any time.",
      es: "[TEXTO MARCADOR — no usar hasta revisión legal]\n\nEste anexo, entre {{practitioner_name}} y {{client_name}} con fecha {{date}}, acompaña tu consentimiento de grabación: las sesiones pueden grabarse para notas, las grabaciones se manejan según los términos de privacidad de la práctica, y puedes retirar el consentimiento en cualquier momento.",
    },
  },
];

export async function ensureStarterTemplates(tenantId: string): Promise<number> {
  let created = 0;
  for (const t of STARTER) {
    for (const locale of ["en", "es"]) {
      const exists = await prisma.agreementTemplate.findFirst({
        where: { tenantId, slug: t.slug, locale },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.agreementTemplate.create({
        data: {
          tenantId,
          slug: t.slug,
          version: 1,
          locale,
          title: t.titles[locale],
          body: t.bodies[locale],
          requiresCountersign: t.requiresCountersign,
          placeholder: true,
        },
      });
      created++;
    }
  }
  return created;
}

export function mergeBody(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? `{{${key}}}`);
}

export async function agEvent(
  tenantId: string,
  agreementId: string,
  kind: string,
  actor: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await prisma.agreementEvent
    .create({ data: { tenantId, agreementId, kind, actor, meta: (meta ?? {}) as Prisma.InputJsonValue } })
    .catch(() => undefined);
}

// §2 — create + send in one motion (manual path) or separately (triggers
// prepare, email sends). Returns the RAW link token exactly once.
export async function createAndSendAgreement(args: {
  tenantId: string;
  templateId: string;
  clientId?: string;
  leadId?: string;
  merge?: Record<string, string>;
  actor?: string;
}): Promise<{ ok: true; agreementId: string; rawToken: string } | { ok: false; error: string }> {
  if (!args.clientId === !args.leadId) return { ok: false, error: "exactly one of client/lead" };
  const template = await prisma.agreementTemplate.findFirst({
    where: { id: args.templateId, status: "ACTIVE" },
  });
  if (!template) return { ok: false, error: "template not found" };

  const [client, practitioner, tenant] = await Promise.all([
    args.clientId
      ? prisma.user.findFirst({ where: { id: args.clientId, role: "CLIENT" }, select: { name: true, email: true, locale: true } })
      : Promise.resolve(null),
    prisma.user.findFirst({ where: { role: "PRACTITIONER" }, select: { name: true } }),
    prisma.tenant.findFirst({ where: { id: args.tenantId }, select: { displayName: true } }),
  ]);
  const lead = args.leadId
    ? await prisma.lead.findFirst({ where: { id: args.leadId }, select: { name: true, email: true } })
    : null;
  if (args.clientId && !client) return { ok: false, error: "client not found" };
  if (args.leadId && !lead) return { ok: false, error: "lead not found" };

  // The client is served THEIR locale sibling of the same slug/version
  // (signature binds to the version they actually read — §1).
  const wantLocale = (client?.locale === "es" ? "es" : "en") as string;
  const sibling =
    template.locale === wantLocale
      ? template
      : (await prisma.agreementTemplate.findFirst({
          where: { tenantId: args.tenantId, slug: template.slug, version: template.version, locale: wantLocale, status: "ACTIVE" },
        })) ?? template;

  const vars: Record<string, string> = {
    client_name: client?.name ?? lead?.name ?? "Client",
    practitioner_name: practitioner?.name ?? tenant?.displayName ?? "Practitioner",
    date: new Date().toISOString().slice(0, 10),
    package_name: args.merge?.package_name ?? "—",
    price: args.merge?.price ?? "—",
    term: args.merge?.term ?? "—",
    ...(args.merge ?? {}),
  };

  const { raw, hash } = generateInviteToken();
  const agreement = await prisma.agreement.create({
    data: {
      tenantId: args.tenantId,
      templateId: sibling.id,
      clientId: args.clientId ?? null,
      leadId: args.leadId ?? null,
      locale: sibling.locale,
      status: "SENT",
      titleSnapshot: sibling.title,
      bodySnapshot: mergeBody(sibling.body, vars),
      mergeData: vars as Prisma.InputJsonValue,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + AGREEMENT_LINK_TTL_DAYS * 86400_000),
      sentAt: new Date(),
      countersignRequired: sibling.requiresCountersign,
    },
  });
  await agEvent(args.tenantId, agreement.id, "created", args.actor ?? "practitioner", { templateSlug: sibling.slug, version: sibling.version });
  await agEvent(args.tenantId, agreement.id, "sent", args.actor ?? "practitioner");

  // Envelope email (best-effort; portal task exists regardless).
  const to = client?.email ?? lead?.email;
  if (to) {
    const { sendEmail } = await import("@/lib/notify");
    const link = `${process.env.APP_BASE_URL ?? ""}/agree/${raw}`;
    await sendEmail({
      to,
      subject: sibling.locale === "es" ? "Un documento para leer y firmar" : "One document to read and sign",
      text:
        sibling.locale === "es"
          ? `${vars.practitioner_name} te envió "${sibling.title}" para leer y firmar.\n\n${link}`
          : `${vars.practitioner_name} sent you "${sibling.title}" to read and sign.\n\n${link}`,
      envelope: { locale: sibling.locale === "es" ? "es" : "en", heading: sibling.title, button: { label: sibling.locale === "es" ? "Leer y firmar" : "Read & sign", url: link } },
    }).catch(() => undefined);
  }
  return { ok: true, agreementId: agreement.id, rawToken: raw };
}

// Resolve a signed link. EXPIRED is computed on read (never a cron race).
export async function agreementByToken(rawToken: string) {
  const agreement = await prisma.agreement.findFirst({ where: { tokenHash: hashToken(rawToken) } });
  if (!agreement) return null;
  if (
    agreement.expiresAt &&
    agreement.expiresAt < new Date() &&
    ["SENT", "VIEWED"].includes(agreement.status)
  ) {
    await prisma.agreement.update({ where: { id: agreement.id }, data: { status: "EXPIRED" } }).catch(() => undefined);
    return { ...agreement, status: "EXPIRED" as const };
  }
  return agreement;
}

export async function markViewed(agreementId: string, actor: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || !["SENT"].includes(a.status)) return;
  await prisma.agreement.update({ where: { id: agreementId }, data: { status: "VIEWED", viewedAt: a.viewedAt ?? new Date() } });
  await agEvent(a.tenantId ?? "", agreementId, "viewed", actor);
}

export async function markDisclosureShown(agreementId: string, actor: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || a.disclosureShownAt) return;
  await prisma.agreement.update({ where: { id: agreementId }, data: { disclosureShownAt: new Date() } });
  await agEvent(a.tenantId ?? "", agreementId, "disclosure", actor);
}

// §3.4 — the signature: unambiguous intent + the full attribution stack.
export async function signAgreement(args: {
  agreementId: string;
  signerName: string;
  drawn?: string | null;
  ip?: string | null;
  agent?: string | null;
  actor: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await prisma.agreement.findFirst({ where: { id: args.agreementId } });
  if (!a) return { ok: false, error: "not found" };
  if (!["SENT", "VIEWED"].includes(a.status)) return { ok: false, error: `cannot sign from ${a.status}` };
  if (!a.disclosureShownAt) return { ok: false, error: "disclosure not shown" };
  if (!args.signerName.trim() || args.signerName.trim().length < 3) return { ok: false, error: "typed legal name required" };
  await prisma.agreement.update({
    where: { id: a.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signerName: args.signerName.trim(),
      signerDrawn: args.drawn ?? null,
      signerIp: args.ip ?? null,
      signerAgent: args.agent ?? null,
    },
  });
  await agEvent(a.tenantId ?? "", a.id, "signed", args.actor, { name: args.signerName.trim(), ip: args.ip, agent: args.agent });
  return { ok: true };
}

export async function declineAgreement(agreementId: string, actor: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || !["SENT", "VIEWED"].includes(a.status)) return;
  await prisma.agreement.update({ where: { id: agreementId }, data: { status: "DECLINED", declinedAt: new Date() } });
  await agEvent(a.tenantId ?? "", agreementId, "declined", actor);
}

export async function countersignAgreement(args: { agreementId: string; name: string }): Promise<{ ok: boolean }> {
  const a = await prisma.agreement.findFirst({ where: { id: args.agreementId } });
  if (!a || a.status !== "SIGNED" || !a.countersignRequired || a.countersignedAt) return { ok: false };
  await prisma.agreement.update({
    where: { id: a.id },
    data: { countersignedAt: new Date(), countersignName: args.name.trim() },
  });
  await agEvent(a.tenantId ?? "", a.id, "countersigned", "practitioner", { name: args.name.trim() });
  return { ok: true };
}

export async function voidAgreement(agreementId: string, reason: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || ["VOIDED"].includes(a.status)) return;
  await prisma.agreement.update({
    where: { id: agreementId },
    data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason || null },
  });
  await agEvent(a.tenantId ?? "", agreementId, "voided", "practitioner", { reason });
}

export async function markPaperSigned(agreementId: string, note: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || !["SENT", "VIEWED", "DRAFT"].includes(a.status)) return;
  await prisma.agreement.update({
    where: { id: agreementId },
    data: { status: "SIGNED", signedAt: new Date(), paperSignedAt: new Date(), signerName: note || "signed on paper" },
  });
  await agEvent(a.tenantId ?? "", agreementId, "paper-signed", "practitioner", { note });
}

// §2 — the before-first-session gate ("One thing to read and sign before
// we begin"): any live agreement from a requireBeforeBooking template.
export async function bookingBlockedByAgreement(clientId: string): Promise<{ blocked: boolean; agreementId?: string; title?: string }> {
  const open = await prisma.agreement.findMany({
    where: { clientId, status: { in: ["SENT", "VIEWED"] } },
    select: { id: true, templateId: true, titleSnapshot: true },
  });
  if (open.length === 0) return { blocked: false };
  const templates = await prisma.agreementTemplate.findMany({
    where: { id: { in: open.map((o) => o.templateId) }, requireBeforeBooking: true },
    select: { id: true },
  });
  const gateIds = new Set(templates.map((t) => t.id));
  const gated = open.find((o) => gateIds.has(o.templateId));
  return gated ? { blocked: true, agreementId: gated.id, title: gated.titleSnapshot } : { blocked: false };
}

// The gentle auto-reminder cadence lives in lib/agreements/sweep.ts (the
// tick's cross-tenant sweep, raw client by design).
