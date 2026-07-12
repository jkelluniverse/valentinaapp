"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { recordConsent } from "@/lib/consent";

// AMENDMENT-01 §5 — the one-time re-grant for a client who accepted an earlier
// version. Records the current grant, then never asks again.
export async function grantConsent(formData: FormData) {
  const user = await requireClient();
  if (formData.get("consent") !== "on") {
    redirect("/space/consent?error=required");
  }
  await recordConsent(user.id);
  redirect("/space");
}
