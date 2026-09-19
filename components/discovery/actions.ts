"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth-guards";
import { dismissHintFor } from "@/lib/onboarding-discovery";

// §6.2/§6.3 — dismissal is forever, and it is the CLIENT's own row (the
// signed-in user, never a passed id).
export async function dismissHint(hintKey: string, path: string) {
  const user = await requireClient();
  await dismissHintFor(user.id, hintKey);
  revalidatePath(path);
}
