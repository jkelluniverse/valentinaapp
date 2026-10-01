import { prisma } from "@/lib/prisma";
import { createAndSendAgreement } from "./index";

// C20 §2 — automatic sending, per-template toggles. Fire-and-forget from
// the moments the spec names: invite acceptance, package purchase,
// recording-consent grant. Never throws into its caller; never double-
// sends (an existing live/signed agreement from the same template slug
// short-circuits).

type TriggerField = "sendOnInviteAccept" | "sendOnPackagePurchase" | "sendOnRecordingConsent";

export async function fireAgreementTrigger(
  tenantId: string,
  field: TriggerField,
  clientId: string,
  merge?: Record<string, string>
): Promise<number> {
  try {
    const templates = await prisma.agreementTemplate.findMany({
      where: { tenantId, status: "ACTIVE", locale: "en", [field]: true },
    });
    let sent = 0;
    for (const t of templates) {
      const existing = await prisma.agreement.findFirst({
        where: {
          clientId,
          status: { in: ["SENT", "VIEWED", "SIGNED"] },
          templateId: { in: (await prisma.agreementTemplate.findMany({ where: { tenantId, slug: t.slug }, select: { id: true } })).map((x) => x.id) },
        },
        select: { id: true },
      });
      if (existing) continue;
      const r = await createAndSendAgreement({ tenantId, templateId: t.id, clientId, merge, actor: "system" });
      if (r.ok) sent++;
    }
    return sent;
  } catch (e) {
    console.error(`[agreements] trigger ${field} failed: ${e instanceof Error ? e.message : "error"}`);
    return 0;
  }
}
