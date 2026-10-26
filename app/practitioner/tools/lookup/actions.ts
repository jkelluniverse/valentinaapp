"use server";

import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { parseLookupParams, saveLookup } from "@/lib/tools/lookup";

// Phase 4 — thin action shell over the lookup save service.

export async function saveLookupToClient(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const params = parseLookupParams({
    kind: String(formData.get("kind") ?? ""),
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    lat: String(formData.get("lat") ?? ""),
    lng: String(formData.get("lng") ?? ""),
  });
  if (!params) redirect("/practitioner/tools/lookup?error=input");
  const result = await saveLookup({
    tenantId: tenant.id,
    clientId: String(formData.get("clientId") ?? ""),
    params: params!,
  });
  if (!result.ok) {
    redirect(result.error === "module" ? "/practitioner/tools" : `/practitioner/tools/lookup?error=${result.error}`);
  }
  redirect("/practitioner/tools/lookup?saved=1");
}
