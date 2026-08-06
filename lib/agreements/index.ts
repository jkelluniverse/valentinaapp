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

// Resolved values may be wrapped in ⟦…⟧ markers (preview-only highlight);
// unresolved vars stay visibly unresolved — a DRAFT renders its gaps.
export function mergeBody(body: string, vars: Record<string, string>, mark = false): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key.toLowerCase()];
    if (v === undefined) return `{{${key}}}`;
    return mark ? `⟦${v}⟧` : v;
  });
}

// v3.1 §4.4 — Exhibit B's "[practice email address]" is filled at RENDER
// time from config, never by editing counsel's stored text.
function fillRenderPlaceholders(body: string, practiceEmail: string | null): string {
  return practiceEmail ? body.replaceAll("[practice email address]", practiceEmail) : body;
}

// The per-item acknowledgments a template demands at signing.
// kind "text" is a fillable field: the client completes it before signing.
// If the template body carries a matching {{fill:<id>}} marker, the field
// renders INLINE at that spot in the document and the signed value is
// substituted there in the sealed record; otherwise it renders as a
// labeled input alongside the acknowledgments.
export type InitialItem = {
  id: string;
  text: string; // the acknowledgment text, or the fillable field's label
  kind: "initials" | "checkbox" | "text";
  required: boolean;
  multiline?: boolean; // text kind only — longer answers
};

export function initialItemsOf(template: { initialItems?: unknown }): InitialItem[] {
  return Array.isArray(template.initialItems) ? (template.initialItems as InitialItem[]) : [];
}

// Substitute the client's filled values into the body wherever the template
// placed {{fill:<id>}} markers (used at seal time and on signed-doc views —
// the client signed the document WITH these values in place).
export function substituteFilledFields(body: string, captured: { id: string; value: string }[]): string {
  let out = body;
  for (const c of captured) out = out.split(`{{fill:${c.id}}}`).join(c.value);
  return out;
}

// The v3.1 signature-page Key Terms — the fields frozen into the sealed
// record, rendered as a table on the sign page and the sealed PDF.
export const KEY_TERM_FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "Client" },
  { key: "package_name", label: "Package" },
  { key: "price", label: "Package price" },
  { key: "session_count", label: "Session credits" },
  { key: "notice_window_hours", label: "Cancellation boundary (hours)" },
  { key: "late_change_fee", label: "Late-change / no-show fee" },
  { key: "late_cancellation_credit_treatment", label: "Credit treatment on late change" },
  { key: "single_session_rate", label: "Single-session rate" },
  { key: "personalized_deliverables_and_value", label: "Personalized deliverables & value" },
  { key: "credit_expiration", label: "Credit expiration" },
  { key: "payer_name_or_self", label: "Payer" },
];

export function keyTermsFrom(mergeData: unknown): [string, string][] {
  const data = (mergeData ?? {}) as Record<string, string>;
  return KEY_TERM_FIELDS.filter((f) => data[f.key] !== undefined).map((f) => [f.label, data[f.key]]);
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

type AgreementContentArgs = {
  tenantId: string;
  templateId: string;
  clientId?: string;
  leadId?: string;
  // C21 — one-off external signer: any name + email, no enrollment.
  recipient?: { name: string; email: string };
  merge?: Record<string, string>;
};

// The single resolver both the PREVIEW and the SEND use — so what the
// practitioner previews is byte-for-byte what goes out (§2 "preview
// merged → Send"). Writes nothing.
async function resolveAgreementContent(args: AgreementContentArgs): Promise<
  | { ok: true; sibling: { id: string; slug: string; kind: string; version: number; versionLabel: string | null; locale: string; title: string; body: string; requiresCountersign: boolean; status: string; initialItems: unknown }; vars: Record<string, string>; recipientEmail: string | null }
  | { ok: false; error: string }
> {
  const identities = [args.clientId, args.leadId, args.recipient].filter(Boolean).length;
  if (identities !== 1) return { ok: false, error: "exactly one of client/lead/recipient" };
  // DRAFT templates resolve (so preview works); only SEND refuses them.
  const template = await prisma.agreementTemplate.findFirst({
    where: { id: args.templateId, status: { in: ["ACTIVE", "DRAFT"] } },
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

  // v3.1 — live data sources for the key-terms vars (never hardcoded):
  // the scheduling policy carries the boundary + fee; the active session
  // rate feeds refund math; the payee field answers "Payer". SOW-only
  // fields (credit treatment, deliverables value, credit expiration) have
  // NO data source yet — they resolve only when passed in `merge`, and
  // stay visibly unresolved otherwise (flagged in the install report).
  const [schedConfig, sessionRate, profile] = await Promise.all([
    prisma.schedulingConfig.findFirst({ select: { cancelCutoffHours: true, lateFeeCents: true } }),
    prisma.priceBook.findFirst({ where: { active: true, kind: "SESSION" }, orderBy: { createdAt: "desc" }, select: { amountCents: true } }),
    args.clientId ? prisma.clientProfile.findUnique({ where: { userId: args.clientId }, select: { payeeName: true } }) : Promise.resolve(null),
  ]);
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const vars: Record<string, string> = {
    client_name: client?.name ?? lead?.name ?? args.recipient?.name ?? "Client",
    practitioner_name: practitioner?.name ?? tenant?.displayName ?? "Practitioner",
    date: new Date().toISOString().slice(0, 10),
    ...(schedConfig ? { notice_window_hours: String(schedConfig.cancelCutoffHours), late_change_fee: money(schedConfig.lateFeeCents) } : {}),
    ...(sessionRate ? { single_session_rate: money(sessionRate.amountCents) } : {}),
    payer_name_or_self: profile?.payeeName ?? "Self",
    ...(args.merge ?? {}),
  };
  return { ok: true, sibling, vars, recipientEmail: client?.email ?? lead?.email ?? args.recipient?.email ?? null };
}

function practiceEmail(): string | null {
  return process.env.PRACTICE_EMAIL ?? process.env.NOTIFY_FROM_EMAIL ?? null;
}

// §2 — the merged preview, exactly as it would send. Persistence-free.
// `mark` wraps resolved values in ⟦…⟧ so the preview can highlight them
// (client-facing renders never mark).
export async function previewAgreement(
  args: AgreementContentArgs & { mark?: boolean }
): Promise<
  | { ok: true; title: string; body: string; locale: string; status: string; versionLabel: string | null; keyTerms: [string, string][]; draft: boolean }
  | { ok: false; error: string }
> {
  const resolved = await resolveAgreementContent(args);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    title: resolved.sibling.title,
    body: fillRenderPlaceholders(mergeBody(resolved.sibling.body, resolved.vars, args.mark ?? false), practiceEmail()),
    locale: resolved.sibling.locale,
    status: resolved.sibling.status,
    versionLabel: resolved.sibling.versionLabel,
    keyTerms: keyTermsFrom(resolved.vars),
    draft: resolved.sibling.status === "DRAFT",
  };
}

// §2 — create + send in one motion (manual path after preview, and the
// automatic triggers). Returns the RAW link token exactly once.
export async function createAndSendAgreement(args: AgreementContentArgs & { actor?: string; suppressEmail?: boolean }): Promise<
  { ok: true; agreementId: string; rawToken: string } | { ok: false; error: string }
> {
  const resolved = await resolveAgreementContent(args);
  if (!resolved.ok) return resolved;
  const { sibling, vars, recipientEmail } = resolved;

  // Hard rule: a DRAFT master never sends — counsel/Jacob flips it live.
  if (sibling.status !== "ACTIVE") {
    return { ok: false, error: `template is ${sibling.status} — not sendable` };
  }

  const { raw, hash } = generateInviteToken();
  const agreement = await prisma.agreement.create({
    data: {
      tenantId: args.tenantId,
      templateId: sibling.id,
      clientId: args.clientId ?? null,
      leadId: args.leadId ?? null,
      recipientEmail: args.recipient?.email ?? null,
      recipientName: args.recipient?.name ?? null,
      locale: sibling.locale,
      status: "SENT",
      titleSnapshot: sibling.title,
      bodySnapshot: fillRenderPlaceholders(mergeBody(sibling.body, vars), practiceEmail()),
      mergeData: vars as Prisma.InputJsonValue,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + AGREEMENT_LINK_TTL_DAYS * 86400_000),
      sentAt: new Date(),
      countersignRequired: sibling.requiresCountersign,
    },
  });
  // C21 — freeze the template's document files onto this request.
  const { copyTemplateFilesToAgreement } = await import("./files");
  await copyTemplateFilesToAgreement(sibling.id, agreement.id, args.tenantId);
  await agEvent(args.tenantId, agreement.id, "created", args.actor ?? "practitioner", { templateSlug: sibling.slug, version: sibling.version });
  await agEvent(args.tenantId, agreement.id, "sent", args.actor ?? "practitioner");

  // Envelope email (best-effort; portal task exists regardless). The link
  // is ABSOLUTE via the house base-url helper (env → request host →
  // production domain — an agreement email must never carry a dead
  // button), and the raw URL rides only the plain-text part: the button
  // carries it in the branded layout.
  if (recipientEmail && !args.suppressEmail) {
    const { sendEmail } = await import("@/lib/notify");
    const { getBaseUrlSafe } = await import("@/lib/base-url");
    const link = `${getBaseUrlSafe()}/agree/${raw}`;
    const es = sibling.locale === "es";
    const sentence = es
      ? `${vars.practitioner_name} te envió "${sibling.title}" para leer y firmar.`
      : `${vars.practitioner_name} sent you "${sibling.title}" to read and sign.`;
    await sendEmail({
      to: recipientEmail,
      subject: es ? "Un documento para leer y firmar" : "One document to read and sign",
      text: `${sentence}\n\n${link}`,
      envelope: {
        locale: es ? "es" : "en",
        heading: sibling.title,
        paragraphs: [sentence],
        button: { label: es ? "Leer y firmar" : "Read & sign", url: link },
      },
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
// v3.1: templates may demand per-item acknowledgments (initials/checkboxes);
// every required item must be captured or the signature refuses.
export async function signAgreement(args: {
  agreementId: string;
  signerName: string;
  drawn?: string | null;
  ip?: string | null;
  agent?: string | null;
  actor: string;
  initials?: Record<string, string>; // itemId → typed initials / "checked"
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await prisma.agreement.findFirst({ where: { id: args.agreementId } });
  if (!a) return { ok: false, error: "not found" };
  if (!["SENT", "VIEWED"].includes(a.status)) return { ok: false, error: `cannot sign from ${a.status}` };
  if (!a.disclosureShownAt) return { ok: false, error: "disclosure not shown" };
  if (!args.signerName.trim() || args.signerName.trim().length < 3) return { ok: false, error: "typed legal name required" };

  const template = await prisma.agreementTemplate.findFirst({ where: { id: a.templateId } });
  const items = initialItemsOf(template ?? {});
  const now = new Date().toISOString();
  const captured: { id: string; value: string; at: string }[] = [];
  for (const item of items) {
    const value = (args.initials?.[item.id] ?? "").trim();
    if (item.required && !value) return { ok: false, error: `acknowledgment required: ${item.id}` };
    if (item.kind === "initials" && value && (value.length < 2 || value.length > 5)) {
      return { ok: false, error: `initials invalid: ${item.id}` };
    }
    if (item.kind === "text" && value.length > 2000) {
      return { ok: false, error: `field too long: ${item.id}` };
    }
    if (value) captured.push({ id: item.id, value, at: now });
  }

  await prisma.agreement.update({
    where: { id: a.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signerName: args.signerName.trim(),
      signerDrawn: args.drawn ?? null,
      signerIp: args.ip ?? null,
      signerAgent: args.agent ?? null,
      initialsCaptured: captured as unknown as Prisma.InputJsonValue,
    },
  });
  await agEvent(a.tenantId ?? "", a.id, "signed", args.actor, {
    name: args.signerName.trim(),
    ip: args.ip,
    agent: args.agent,
    acknowledgments: captured.length,
  });
  return { ok: true };
}

export async function declineAgreement(agreementId: string, actor: string): Promise<void> {
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a || !["SENT", "VIEWED"].includes(a.status)) return;
  await prisma.agreement.update({ where: { id: agreementId }, data: { status: "DECLINED", declinedAt: new Date() } });
  await agEvent(a.tenantId ?? "", agreementId, "declined", actor);
}

// C21 — the practitioner's stored signature mark: drawn once in settings,
// applied automatically (with the auto-set timestamp) whenever she signs
// or countersigns. Stored practice-level, like the other practice settings.
export const PRACTITIONER_SIGNATURE_KEY = "practitionerSignatureDrawn";

export async function getPractitionerSignature(): Promise<string | null> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: PRACTITIONER_SIGNATURE_KEY } });
  return row?.value || null;
}

export async function setPractitionerSignature(dataUrl: string | null): Promise<void> {
  if (!dataUrl) {
    await prisma.practiceSetting.deleteMany({ where: { key: PRACTITIONER_SIGNATURE_KEY } });
    return;
  }
  if (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 200_000) return;
  await prisma.practiceSetting.upsert({
    where: { key: PRACTITIONER_SIGNATURE_KEY },
    create: { key: PRACTITIONER_SIGNATURE_KEY, value: dataUrl },
    update: { value: dataUrl },
  });
}

export async function countersignAgreement(args: { agreementId: string; name: string }): Promise<{ ok: boolean }> {
  const a = await prisma.agreement.findFirst({ where: { id: args.agreementId } });
  if (!a || a.status !== "SIGNED" || !a.countersignRequired || a.countersignedAt) return { ok: false };
  // Her stored mark rides along automatically; the timestamp IS the date.
  const drawn = await getPractitionerSignature();
  await prisma.agreement.update({
    where: { id: a.id },
    data: { countersignedAt: new Date(), countersignName: args.name.trim(), countersignDrawn: drawn },
  });
  await agEvent(a.tenantId ?? "", a.id, "countersigned", "practitioner", { name: args.name.trim() });
  return { ok: true };
}

// C21 — practitioner-only documents (a dispute narrative, an exhibit log):
// she is the signer. One motion: create the record, run the same
// viewed→disclosure→signed trail under her name with her stored mark,
// auto-date, and seal. Refuses dual-signature templates (those go through
// the normal send→sign→countersign path).
export async function selfSignAndSeal(args: {
  tenantId: string;
  templateId: string;
  merge?: Record<string, string>;
}): Promise<{ ok: true; agreementId: string } | { ok: false; error: string }> {
  const practitioner = await prisma.user.findFirst({ where: { role: "PRACTITIONER" }, select: { name: true, email: true } });
  if (!practitioner) return { ok: false, error: "practitioner not found" };
  const template = await prisma.agreementTemplate.findFirst({ where: { id: args.templateId } });
  if (!template) return { ok: false, error: "template not found" };
  if (template.requiresCountersign) return { ok: false, error: "dual-signature documents go through send + countersign" };

  const created = await createAndSendAgreement({
    tenantId: args.tenantId,
    templateId: args.templateId,
    recipient: { name: practitioner.name ?? "Practitioner", email: practitioner.email ?? "" },
    merge: args.merge,
    actor: "practitioner",
    suppressEmail: true,
  });
  if (!created.ok) return created;

  await markViewed(created.agreementId, "practitioner");
  await markDisclosureShown(created.agreementId, "practitioner");
  const drawn = await getPractitionerSignature();
  const signed = await signAgreement({
    agreementId: created.agreementId,
    signerName: practitioner.name ?? "Practitioner",
    drawn,
    actor: "practitioner",
  });
  if (!signed.ok) return signed;
  const { sealIfComplete } = await import("./seal");
  await sealIfComplete(created.agreementId);
  return { ok: true, agreementId: created.agreementId };
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
