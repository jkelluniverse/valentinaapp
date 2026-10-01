"use server";

import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { recordDraw } from "@/lib/tools/draw-service";

// Phase 4 — thin action shell over the draw service.

export async function performDraw(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const clientId = String(formData.get("clientId") ?? "");
  const result = await recordDraw({
    tenantId: tenant.id,
    clientId,
    spread: String(formData.get("spread") ?? "single"),
    sessionId: String(formData.get("sessionId") ?? "") || null,
  });
  if (!result.ok) {
    redirect(result.error === "module" ? "/practitioner/tools" : "/practitioner/tools/draw?error=input");
  }
  redirect(`/practitioner/tools/draw?client=${clientId}&drawn=${result.ok ? result.readingId : ""}`);
}
