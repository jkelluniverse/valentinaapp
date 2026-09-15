"use server";

// wall-allow: the narrow discovery manage actions (C18 §4.5). A signed token
// authenticates a prospect with no account; reaches only their own Appointment +
// Lead via lib/discovery.

import { redirect } from "next/navigation";
import { getBaseUrl } from "@/lib/base-url";
import { appointmentIdFromToken, rescheduleDiscovery, cancelDiscovery } from "@/lib/discovery";

export async function rescheduleAction(token: string, formData: FormData): Promise<void> {
  const appointmentId = appointmentIdFromToken(token);
  if (!appointmentId) redirect(`/discovery/${token}?error=gone`);
  const startIso = String(formData.get("startAt") ?? "");
  const startAt = new Date(startIso);
  if (!startIso || Number.isNaN(startAt.getTime())) redirect(`/discovery/${token}?error=missing`);
  const res = await rescheduleDiscovery(appointmentId!, startAt, getBaseUrl());
  redirect(res.ok ? `/discovery/${token}?moved=1` : `/discovery/${token}?error=${res.error ?? "unavailable"}`);
}

export async function cancelAction(token: string): Promise<void> {
  const appointmentId = appointmentIdFromToken(token);
  if (!appointmentId) redirect(`/discovery/${token}?error=gone`);
  await cancelDiscovery(appointmentId!, getBaseUrl());
  redirect(`/discovery/${token}?cancelled=1`);
}
