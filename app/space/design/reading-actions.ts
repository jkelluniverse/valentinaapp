"use server";

import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { ensureReading } from "@/lib/integrative-reading";

// Generate (or return) the caller's own reading. Client-callable; the reading
// is chart-only by construction in ensureReading (the bright line, C12r §2).
export async function generateMyReading(): Promise<{
  ok: boolean;
  content?: string;
  status?: string;
  error?: string;
}> {
  const user = await requireClient();
  // AMENDMENT-01: the unified consent covers generating the personal reading.
  if (!(await hasConsent(user.id))) return { ok: false, error: "consent" };
  const res = await ensureReading(user.id);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, content: res.reading.content, status: res.reading.status };
}
