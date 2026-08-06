import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as scopedPrisma } from "@/lib/prisma";
import { putObject, getObject } from "@/lib/storage";
import { renderSealedPdf } from "./pdf";
import { E_RECORDS_DISCLOSURE, keyTermsFrom, initialItemsOf, substituteFilledFields } from "./index";

// C20 §4 — seal & store. On final signature (client signature, plus the
// countersign when the template asks for one) the sealed PDF is generated,
// SHA-256-hashed, stored through the storage adapter (local driver now,
// R2 later — same key), and BOTH parties keep it: the client by email and
// in their space, the practitioner in the agreements list. Any future
// download re-verifies the hash (tamper evidence).

export function agreementSealKey(tenantId: string, agreementId: string): string {
  return `agreements/${tenantId}/${agreementId}.pdf`;
}

// The tick's cross-tenant sweep passes the raw client; in-request callers
// use the scoped default.
export async function sealIfComplete(
  agreementId: string,
  db: PrismaClient = scopedPrisma as unknown as PrismaClient
): Promise<{ sealed: boolean; reason?: string }> {
  const prisma = db;
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a) return { sealed: false, reason: "not found" };
  if (a.status !== "SIGNED") return { sealed: false, reason: `status ${a.status}` };
  if (a.countersignRequired && !a.countersignedAt) return { sealed: false, reason: "awaiting countersign" };
  if (a.sealedKey && a.sealedSha256) return { sealed: true, reason: "already sealed" };

  const [tenant, events, template] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: a.tenantId ?? "" }, select: { displayName: true } }),
    prisma.agreementEvent.findMany({ where: { agreementId: a.id }, orderBy: { at: "asc" } }),
    prisma.agreementTemplate.findFirst({ where: { id: a.templateId }, select: { initialItems: true } }),
  ]);

  // v3.1 — join captured acknowledgments to their template text so the
  // sealed PDF shows what each set of initials actually acknowledged.
  // Fillable "text" items are separated out: their values substitute into
  // the document body wherever the template placed {{fill:<id>}} markers,
  // and they also get their own attributed section.
  const items = initialItemsOf(template ?? {});
  const itemById = new Map(items.map((i) => [i.id, i]));
  const captured = Array.isArray(a.initialsCaptured) ? (a.initialsCaptured as { id: string; value: string; at: string }[]) : [];
  const acknowledgments = captured
    .filter((c) => itemById.get(c.id)?.kind !== "text")
    .map((c) => ({ text: itemById.get(c.id)?.text ?? c.id, value: c.value, at: c.at }));
  const textCaptured = captured.filter((c) => itemById.get(c.id)?.kind === "text");
  const filledFields = textCaptured.map((c) => ({ label: itemById.get(c.id)?.text ?? c.id, value: c.value, at: c.at }));

  const locale = (a.locale === "es" ? "es" : "en") as "en" | "es";
  const pdf = renderSealedPdf({
    title: a.titleSnapshot,
    body: substituteFilledFields(a.bodySnapshot, textCaptured),
    locale,
    practiceName: tenant?.displayName ?? "",
    signer: {
      name: a.signerName ?? "—",
      at: a.signedAt?.toISOString() ?? "",
      ip: a.signerIp,
      agent: a.signerAgent,
      drawn: Boolean(a.signerDrawn),
      drawnPng: a.signerDrawn,
    },
    countersigner:
      a.countersignedAt && a.countersignName ? { name: a.countersignName, at: a.countersignedAt.toISOString() } : null,
    disclosure: E_RECORDS_DISCLOSURE[locale],
    disclosureShownAt: a.disclosureShownAt?.toISOString() ?? null,
    events: events.map((e) => ({
      at: e.at.toISOString(),
      kind: e.kind,
      actor: e.actor,
      detail: e.meta && typeof e.meta === "object" && "name" in (e.meta as object) ? String((e.meta as { name?: string }).name ?? "") : undefined,
    })),
    agreementId: a.id,
    paperSigned: Boolean(a.paperSignedAt),
    keyTerms: keyTermsFrom(a.mergeData),
    acknowledgments,
    filledFields,
  });

  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const key = agreementSealKey(a.tenantId ?? "default", a.id);
  putObject(key, pdf);
  await prisma.agreement.update({ where: { id: a.id }, data: { sealedKey: key, sealedSha256: sha256 } });
  await prisma.agreementEvent
    .create({ data: { tenantId: a.tenantId, agreementId: a.id, kind: "sealed", actor: "system", meta: { sha256 } } })
    .catch(() => undefined);

  // The client's copy, by email (best-effort; the portal copy is permanent).
  const client = a.clientId
    ? await prisma.user.findFirst({ where: { id: a.clientId }, select: { email: true } })
    : a.leadId
      ? await prisma.lead.findFirst({ where: { id: a.leadId }, select: { email: true } })
      : null;
  if (client?.email) {
    const { sendEmail } = await import("@/lib/notify");
    await sendEmail({
      to: client.email,
      subject: locale === "es" ? `Firmado: ${a.titleSnapshot}` : `Signed: ${a.titleSnapshot}`,
      text:
        locale === "es"
          ? "Tu copia firmada está adjunta. También vive en tu espacio, siempre."
          : "Your signed copy is attached. It also lives in your space, always.",
      attachments: [{ filename: `${a.titleSnapshot.replace(/[^\w-]+/g, "-")}.pdf`, contentBase64: pdf.toString("base64"), contentType: "application/pdf" }],
    }).catch(() => undefined);
  }
  return { sealed: true };
}

// §4 tamper evidence: a download only succeeds when the stored bytes still
// hash to the sealed record.
export async function readSealedPdf(agreementId: string): Promise<{ ok: true; pdf: Buffer; filename: string } | { ok: false; reason: "unsealed" | "missing" | "tampered" }> {
  const prisma = scopedPrisma as unknown as PrismaClient;
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (!a?.sealedKey || !a.sealedSha256) return { ok: false, reason: "unsealed" };
  const bytes = getObject(a.sealedKey);
  if (!bytes) return { ok: false, reason: "missing" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== a.sealedSha256) return { ok: false, reason: "tampered" };
  await prisma.agreementEvent
    .create({ data: { tenantId: a.tenantId, agreementId: a.id, kind: "downloaded", actor: "system" } })
    .catch(() => undefined);
  return { ok: true, pdf: bytes, filename: `${a.titleSnapshot.replace(/[^\w-]+/g, "-")}.pdf` };
}
