"use server";

// C12X — server actions for the intelligence surfaces: the Integration Guide,
// the three ledgers (Goals / Belief Work / Intervention outcomes), resonance
// on Guide claims, and Ask the Record. All practitioner-only, client-scoped,
// metadata-only logging.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { runIntegrationGuide } from "@/lib/integration-guide";
import { askRecord } from "@/lib/ask-record";
import { markResonance, isResonanceValue } from "@/lib/resonance";
import { generateStatementOptions, lintStatement } from "@/lib/belief-statements";

function base(clientId: string) {
  return `/practitioner/clients/${clientId}`;
}
function back(clientId: string, tab: string, query?: string) {
  return `${base(clientId)}?tab=${tab}${query ? `&${query}` : ""}`;
}
async function ownClient(clientId: string) {
  return prisma.user.findFirst({ where: { id: clientId, role: "CLIENT" }, select: { id: true, locale: true } });
}

// ---- The Guide (§3) ----

export async function refreshGuide(clientId: string) {
  const me = await requirePractitioner();
  if (!(await ownClient(clientId))) redirect("/practitioner/clients");
  const res = await runIntegrationGuide(clientId, me.id);
  revalidatePath(base(clientId));
  redirect(back(clientId, "guide", res.ok ? "guide=fresh" : `guide=${res.error}`));
}

export async function markGuideClaim(clientId: string, claimKey: string, formData: FormData) {
  const me = await requirePractitioner();
  const value = String(formData.get("value") ?? "");
  if ((await ownClient(clientId)) && isResonanceValue(value) && claimKey.length <= 80) {
    await markResonance({
      clientId,
      subjectType: "GUIDE_CLAIM",
      subjectKey: claimKey,
      value,
      markedById: me.id,
      markedByRole: "PRACTITIONER",
    });
  }
  revalidatePath(base(clientId));
  redirect(back(clientId, "guide"));
}

// ---- Goals (§7 domain B) — original wording sacred ----

export async function addGoal(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  if (!(await ownClient(clientId))) redirect("/practitioner/clients");
  const statement = String(formData.get("statement") ?? "").trim();
  if (!statement) redirect(back(clientId, "goals", "goal=empty"));
  await prisma.clientGoal.create({
    data: {
      clientId,
      statement, // verbatim, immutable — no update path exists for this field
      whyItMatters: String(formData.get("whyItMatters") ?? "").trim() || null,
      obstacles: String(formData.get("obstacles") ?? "").trim() || null,
      createdById: me.id,
    },
  });
  console.log(`[goals] added client=${clientId} by=${me.id}`);
  revalidatePath(base(clientId));
  redirect(back(clientId, "goals", "goal=added"));
}

export async function setGoalStatus(clientId: string, goalId: string, formData: FormData) {
  await requirePractitioner();
  const status = String(formData.get("status") ?? "");
  if (["ACTIVE", "PROGRESSING", "ACHIEVED", "RETIRED"].includes(status)) {
    await prisma.clientGoal.updateMany({ where: { id: goalId, clientId }, data: { status } });
  }
  revalidatePath(base(clientId));
  redirect(back(clientId, "goals"));
}

// ---- Belief Work (§7 domain K + §7 workflow) ----

export async function addBelief(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  if (!(await ownClient(clientId))) redirect("/practitioner/clients");
  const belief = String(formData.get("belief") ?? "").trim();
  if (!belief) redirect(back(clientId, "beliefs", "belief=empty"));
  const nodeId = String(formData.get("nodeId") ?? "").trim() || null;
  if (nodeId) {
    const node = await prisma.psycheNode.findFirst({ where: { id: nodeId, clientId } });
    if (!node) redirect(back(clientId, "beliefs", "belief=badnode"));
  }
  await prisma.beliefWork.create({
    data: { clientId, belief, nodeId, createdById: me.id },
  });
  console.log(`[beliefs] added client=${clientId} by=${me.id}`);
  revalidatePath(base(clientId));
  redirect(back(clientId, "beliefs", "belief=added"));
}

export async function generateBeliefOptions(clientId: string, beliefId: string) {
  await requirePractitioner();
  const bw = await prisma.beliefWork.findFirst({ where: { id: beliefId, clientId } });
  const client = await ownClient(clientId);
  if (!bw || !client) redirect(back(clientId, "beliefs"));
  const res = await generateStatementOptions(bw.belief, client.locale === "es" ? "es" : "en");
  if (!res.ok) redirect(back(clientId, "beliefs", `belief=${res.error}`));
  // Store options WITH their mechanical lint so the wizard shows both.
  const options = res.options.map((text) => ({ text, lint: lintStatement(text) }));
  await prisma.beliefWork.update({
    where: { id: bw.id },
    data: { statementOptions: options as unknown as object },
  });
  revalidatePath(base(clientId));
  redirect(back(clientId, "beliefs", "belief=options"));
}

// The approval gate (8th criterion): a statement is unusable anywhere until
// this records the CLIENT's approval — the checkbox is her attestation that
// the client chose/adapted this wording in session.
export async function approveBeliefStatement(clientId: string, beliefId: string, formData: FormData) {
  const me = await requirePractitioner();
  const bw = await prisma.beliefWork.findFirst({ where: { id: beliefId, clientId } });
  if (!bw) redirect(back(clientId, "beliefs"));
  const statement = String(formData.get("statement") ?? "").trim();
  const attested = formData.get("clientApproved") === "on";
  if (!statement) redirect(back(clientId, "beliefs", "belief=nostatement"));
  if (!attested) redirect(back(clientId, "beliefs", "belief=unattested"));
  const lint = lintStatement(statement);
  if (!lint.pass) redirect(back(clientId, "beliefs", "belief=lint"));
  await prisma.beliefWork.update({
    where: { id: bw.id },
    data: {
      approvedStatement: statement,
      approvedAt: new Date(),
      balanceUsed: String(formData.get("balanceUsed") ?? "").trim() || bw.balanceUsed,
    },
  });
  console.log(`[beliefs] approved client=${clientId} belief=${beliefId} by=${me.id}`);
  revalidatePath(base(clientId));
  redirect(back(clientId, "beliefs", "belief=approved"));
}

export async function updateBeliefOutcome(clientId: string, beliefId: string, formData: FormData) {
  await requirePractitioner();
  const status = String(formData.get("status") ?? "");
  await prisma.beliefWork.updateMany({
    where: { id: beliefId, clientId },
    data: {
      subjectiveResponse: String(formData.get("subjectiveResponse") ?? "").trim() || null,
      balanceUsed: String(formData.get("balanceUsed") ?? "").trim() || null,
      ...(["ACTIVE", "REVISED", "RETIRED"].includes(status) ? { status } : {}),
    },
  });
  revalidatePath(base(clientId));
  redirect(back(clientId, "beliefs", "belief=updated"));
}

// ---- Intervention outcomes (§7 domain L) ----

export async function saveInterventionOutcome(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  if (!(await ownClient(clientId))) redirect("/practitioner/clients");
  const assignmentId = String(formData.get("assignmentId") ?? "").trim() || null;
  const worksheetAssignmentId = String(formData.get("worksheetAssignmentId") ?? "").trim() || null;
  if (!assignmentId && !worksheetAssignmentId) redirect(back(clientId, "outcomes"));
  // Scope check: the assignment must be this client's.
  if (assignmentId) {
    const a = await prisma.assignment.findFirst({ where: { id: assignmentId, clientId } });
    if (!a) redirect(back(clientId, "outcomes"));
  }
  if (worksheetAssignmentId) {
    const w = await prisma.worksheetAssignment.findFirst({
      where: { id: worksheetAssignmentId, clientId },
    });
    if (!w) redirect(back(clientId, "outcomes"));
  }
  const decision = String(formData.get("decision") ?? "");
  const data = {
    clientId,
    purpose: String(formData.get("purpose") ?? "").trim() || null,
    clientResponse: String(formData.get("clientResponse") ?? "").trim() || null,
    insights: String(formData.get("insights") ?? "").trim() || null,
    difficulties: String(formData.get("difficulties") ?? "").trim() || null,
    decision: ["REPEAT", "ADAPT", "DISCONTINUE"].includes(decision) ? decision : null,
    createdById: me.id,
  };
  if (assignmentId) {
    await prisma.interventionOutcome.upsert({
      where: { assignmentId },
      create: { ...data, assignmentId },
      update: data,
    });
  } else {
    await prisma.interventionOutcome.upsert({
      where: { worksheetAssignmentId: worksheetAssignmentId! },
      create: { ...data, worksheetAssignmentId },
      update: data,
    });
  }
  console.log(`[interventions] outcome saved client=${clientId} by=${me.id}`);
  revalidatePath(base(clientId));
  redirect(back(clientId, "outcomes", "outcome=saved"));
}

// ---- Ask the Record (§8) ----

export async function askTheRecord(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  if (!(await ownClient(clientId))) redirect("/practitioner/clients");
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) redirect(back(clientId, "ask"));
  const res = await askRecord(clientId, me.id, question);
  revalidatePath(base(clientId));
  redirect(back(clientId, "ask", res.ok ? undefined : `ask=${res.error}`));
}
