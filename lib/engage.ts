import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail } from "@/lib/notify";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy/scope";
import {
  ENGAGE_ENABLED_KEY,
  ENGAGE_PAUSED_KEY,
  REASONS,
  engageEnvEnabled,
  engageEnvPaused,
  engageLocale,
  engagePortalUrl,
  engageSignupUrl,
  engageUnsubscribeUrl,
  unsubscribeToken,
  type EngageLocale,
  type MergeVars,
} from "@/lib/engage-config";
import { firstNameOf } from "@/lib/referral-config";
import { renderEngageMessage } from "@/lib/engage-templates";
import {
  EVENT_SOURCE_PREFIX,
  anchorFor,
  sequencesFor,
  stepDueAt,
  type EngageSequence,
  type EngageStep,
} from "@/lib/engage-sequences";

// C23-ENGAGE §4 — the engine. Given a "now", compute the due steps for
// eligible prospects and, for each one, CLAIM its ledger row, decide, act.
//
// Which prisma client and why: `ProspectMessage` and `PractitionerProspect` are
// both platform-level (outside SCOPED_MODEL_SET), so the scoped client passes
// those calls straight through — no guard-prisma allowlist entry is needed and
// none is taken. The one scoped model this module writes is `AuditEvent`, and
// it is stamped EXPLICITLY with the default tenant rather than left to the
// request: the tick can be driven from a cron request or from the CLI, and a
// null-tenant row would be drift in the nightly stamp audit either way.
//
// IDEMPOTENT BY CONSTRUCTION: a step is claimed by INSERTING its ledger row,
// and the unique (prospectId, sequenceKey, stepKey) index is what refuses the
// second one. Running the engine twice for the same "as of" therefore cannot
// produce a second message — not because this code is careful, but because the
// database will not have it.
//
// THE SEAM (the spec's whole point): with `emailConfigured()` false a due step
// is recorded UNCONFIGURED and left RE-SENDABLE. A tick that never sent
// anything must never leave a prospect permanently marked as messaged.

/** Statuses that end a step's life. Nothing reconsiders these. */
const TERMINAL = new Set(["SENT", "SUPPRESSED"]);
/** A PENDING row younger than this is another worker's live claim. */
const STALE_CLAIM_MS = 15 * 60_000;
/** Bound per tick — a tick is a step, not a migration. */
const DEFAULT_LIMIT = 500;

export type EngageStatus = "PENDING" | "SENT" | "SKIPPED" | "SUPPRESSED" | "UNCONFIGURED";

export type PlannedStep = {
  prospectId: string;
  name: string;
  email: string;
  sequenceKey: string;
  stepKey: string;
  templateKey: string;
  locale: EngageLocale;
  scheduledFor: Date;
  due: boolean;
  /** What the ledger already says about this step, if anything. */
  existingStatus: EngageStatus | null;
  /** What a tick right now would record. */
  plannedStatus: EngageStatus;
  reason: string | null;
};

export type EngageSwitches = { gateOpen: boolean; paused: boolean; envEnabled: boolean; envPaused: boolean };

export type EngageTickResult = {
  asOf: string;
  dryRun: boolean;
  switches: EngageSwitches;
  emailConfigured: boolean;
  considered: number;
  counts: Record<EngageStatus, number>;
  /** One entry per step acted on (or that would have been). */
  steps: PlannedStep[];
};

// ---------------------------------------------------------------------------
// The switches (law #10)
// ---------------------------------------------------------------------------

/**
 * Read both switches. The gate is CLOSED unless something explicitly opens it;
 * the pause CLOSES everything regardless of the gate. Two independent ways to
 * stop the mailer, and the DB one needs no deploy at all.
 */
export async function engageSwitches(): Promise<EngageSwitches> {
  const [enabledRow, pausedRow] = await Promise.all([
    prisma.practiceSetting.findFirst({ where: { key: ENGAGE_ENABLED_KEY } }).catch(() => null),
    prisma.practiceSetting.findFirst({ where: { key: ENGAGE_PAUSED_KEY } }).catch(() => null),
  ]);
  const envEnabled = engageEnvEnabled();
  const envPaused = engageEnvPaused();
  return {
    gateOpen: envEnabled || enabledRow?.value === "on",
    paused: envPaused || pausedRow?.value === "on",
    envEnabled,
    envPaused,
  };
}

// ---------------------------------------------------------------------------
// Planning — pure projection over the ledger. Writes nothing, ever, which is
// what makes the admin dry-run (§5) provably harmless.
// ---------------------------------------------------------------------------

type ProspectRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  source: string | null;
  locale: string | null;
  referralCode: string;
  tenantId: string | null;
  convertedAt: Date | null;
  unsubscribedAt: Date | null;
  createdAt: Date;
};

async function eligibleProspects(limit: number): Promise<ProspectRow[]> {
  // Exactly the two audiences the two sequences define (§2). A non-event LEAD
  // (`source: web`) is not in either set and is never loaded — the negative
  // case of Verify item 2 holds at the query, not just at the predicate.
  return (await prisma.practitionerProspect.findMany({
    where: {
      OR: [
        { status: "LEAD", source: { startsWith: EVENT_SOURCE_PREFIX } },
        { status: "SIGNED_UP" },
      ],
    },
    select: {
      id: true, name: true, email: true, status: true, source: true, locale: true,
      referralCode: true, tenantId: true, convertedAt: true, unsubscribedAt: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })) as ProspectRow[];
}

function decide(
  p: ProspectRow,
  sequence: EngageSequence,
  switches: EngageSwitches,
  configured: boolean,
): { status: EngageStatus; reason: string | null } {
  // Consent FIRST — before the gate, before the pause, before the transport.
  // A prospect who opted out is never contacted by any sequence, present or
  // future, and no code path below can reach a send without passing here.
  if (p.unsubscribedAt) return { status: "SUPPRESSED", reason: REASONS.unsubscribed };
  if (!switches.gateOpen) return { status: "SKIPPED", reason: REASONS.gateClosed };
  if (switches.paused) return { status: "SKIPPED", reason: REASONS.paused };
  if (!sequence.enabled) return { status: "SKIPPED", reason: REASONS.sequenceOff };
  if (!configured) return { status: "UNCONFIGURED", reason: REASONS.unconfigured };
  return { status: "SENT", reason: REASONS.sent };
}

export type PlanOptions = {
  asOf?: Date;
  /** Include steps that are scheduled but not yet due (the §5 queue view). */
  includeUpcoming?: boolean;
  limit?: number;
};

export async function planEngage(opts: PlanOptions = {}): Promise<{
  asOf: Date;
  switches: EngageSwitches;
  configured: boolean;
  steps: PlannedStep[];
}> {
  const asOf = opts.asOf ?? new Date();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const [switches, prospects] = await Promise.all([engageSwitches(), eligibleProspects(limit)]);
  const configured = emailConfigured();

  const ledger = await prisma.prospectMessage.findMany({
    where: { prospectId: { in: prospects.map((p) => p.id) } },
  });
  const ledgerKey = (prospectId: string, seq: string, step: string) => `${prospectId}|${seq}|${step}`;
  const existing = new Map(
    ledger.map((r) => [ledgerKey(r.prospectId, r.sequenceKey, r.stepKey), r]),
  );

  const steps: PlannedStep[] = [];
  for (const p of prospects) {
    // Evaluated against CURRENT status, which is what makes §2's mid-sequence
    // transition work with no transition machinery.
    for (const sequence of sequencesFor({ status: p.status, source: p.source })) {
      const anchor = anchorFor(sequence, p);
      for (const step of sequence.steps) {
        const scheduledFor = stepDueAt(anchor, step);
        const due = scheduledFor.getTime() <= asOf.getTime();
        if (!due && !opts.includeUpcoming) continue;
        const prior = existing.get(ledgerKey(p.id, sequence.key, step.key));
        if (prior && TERMINAL.has(prior.status)) {
          if (!opts.includeUpcoming) continue; // done with, never reconsidered
        }
        const outcome = prior && TERMINAL.has(prior.status)
          ? { status: prior.status as EngageStatus, reason: prior.reason }
          : decide(p, sequence, switches, configured);
        steps.push({
          prospectId: p.id,
          name: p.name,
          email: p.email,
          sequenceKey: sequence.key,
          stepKey: step.key,
          templateKey: step.templateKey,
          locale: engageLocale(p.locale),
          scheduledFor,
          due,
          existingStatus: (prior?.status as EngageStatus) ?? null,
          plannedStatus: due ? outcome.status : "PENDING",
          reason: due ? outcome.reason : null,
        });
      }
    }
  }
  steps.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return { asOf, switches, configured, steps };
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/** The transport, as the engine sees it. Defaults to lib/notify's sendEmail —
 *  the ONE email layer in this codebase (there is no second one). The parameter
 *  exists so the acceptance harness can assert AT THE TRANSPORT BOUNDARY
 *  (Verify item 7) that a suppressed prospect produces no call at all; no
 *  production caller passes it. */
export type EngageSend = typeof sendEmail;

export type TickOptions = PlanOptions & { dryRun?: boolean; send?: EngageSend };

const ZERO: Record<EngageStatus, number> = {
  PENDING: 0, SENT: 0, SKIPPED: 0, SUPPRESSED: 0, UNCONFIGURED: 0,
};

export async function engageTick(opts: TickOptions = {}): Promise<EngageTickResult> {
  const asOf = opts.asOf ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const send = opts.send ?? sendEmail;

  const plan = await planEngage({ asOf, limit: opts.limit });
  const due = plan.steps.filter((s) => s.due);
  const counts = { ...ZERO };
  const acted: PlannedStep[] = [];

  for (const step of due) {
    if (dryRun) {
      counts[step.plannedStatus] += 1;
      acted.push(step);
      continue;
    }
    const claimed = await claimStep(step);
    if (!claimed) continue; // terminal, or another worker holds the claim
    const final = await actOnStep(step, plan.switches, plan.configured, send, claimed.id, asOf);
    counts[final.status] += 1;
    acted.push({ ...step, plannedStatus: final.status, reason: final.reason, existingStatus: final.status });
  }

  return {
    asOf: asOf.toISOString(),
    dryRun,
    switches: plan.switches,
    emailConfigured: plan.configured,
    considered: due.length,
    counts,
    steps: acted,
  };
}

/** Claim a step by inserting its ledger row. The unique constraint IS the
 *  claim: a second concurrent tick's insert is refused by the database.
 *  Returns the claimed row, or null when this step must be left alone. */
async function claimStep(step: PlannedStep): Promise<{ id: string } | null> {
  try {
    const row = await prisma.prospectMessage.create({
      data: {
        prospectId: step.prospectId,
        sequenceKey: step.sequenceKey,
        stepKey: step.stepKey,
        locale: step.locale,
        status: "PENDING",
        scheduledFor: step.scheduledFor,
      },
      select: { id: true },
    });
    return row;
  } catch {
    // Already claimed once. NO second row is ever created — the constraint
    // refused it. Whether this step may be reconsidered depends on what the
    // existing row says:
    //   SENT / SUPPRESSED  → done with. Untouched.
    //   PENDING (fresh)    → a live claim. Untouched.
    //   PENDING (stale)    → a crashed tick. Reclaimed.
    //   SKIPPED            → the gate was closed. Reconsidered.
    //   UNCONFIGURED       → no credential existed. Reconsidered — THIS is
    //                        what "left re-sendable" means (Verify item 10).
    const existing = await prisma.prospectMessage.findUnique({
      where: {
        prospectId_sequenceKey_stepKey: {
          prospectId: step.prospectId,
          sequenceKey: step.sequenceKey,
          stepKey: step.stepKey,
        },
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (!existing) return null;
    if (TERMINAL.has(existing.status)) return null;
    if (existing.status === "PENDING" && Date.now() - existing.createdAt.getTime() < STALE_CLAIM_MS) {
      return null;
    }
    return { id: existing.id };
  }
}

async function actOnStep(
  step: PlannedStep,
  switches: EngageSwitches,
  configured: boolean,
  send: EngageSend,
  rowId: string,
  asOf: Date,
): Promise<{ status: EngageStatus; reason: string | null }> {
  // Re-read the prospect: between planning and acting they may have
  // unsubscribed, and consent is honoured SERVER-SIDE BEFORE ANY SEND.
  const p = (await prisma.practitionerProspect.findUnique({
    where: { id: step.prospectId },
    select: {
      id: true, name: true, email: true, status: true, source: true, locale: true,
      referralCode: true, tenantId: true, convertedAt: true, unsubscribedAt: true, createdAt: true,
    },
  })) as ProspectRow | null;

  let outcome: { status: EngageStatus; reason: string | null };
  if (!p) {
    outcome = { status: "SKIPPED", reason: "prospect-gone" };
  } else {
    const sequence = sequencesFor({ status: p.status, source: p.source }).find(
      (s) => s.key === step.sequenceKey,
    );
    if (!sequence) {
      // They left the audience between planning and acting (e.g. converted
      // mid-tick). Not an error, and emphatically not a send.
      outcome = { status: "SKIPPED", reason: "left-audience" };
    } else {
      outcome = decide(p, sequence, switches, configured);
      if (outcome.status === "SENT") {
        const rendered = renderEngageMessage(step.locale, step.templateKey, await mergeVarsFor(p));
        const res = await send({
          to: p.email,
          subject: rendered.subject,
          text: rendered.text,
          envelope: {
            locale: step.locale,
            preheader: rendered.preheader,
            heading: rendered.heading,
            paragraphs: rendered.paragraphs,
            button: rendered.button,
            signoff: rendered.signoff,
            unsubscribe: rendered.unsubscribe,
          },
        });
        if (!res.ok) {
          // Left re-sendable on purpose: a transport that refused is not a
          // delivery, and pretending otherwise loses the follow-up.
          outcome = { status: "SKIPPED", reason: REASONS.sendFailed };
        }
      }
    }
  }

  await prisma.prospectMessage.update({
    where: { id: rowId },
    data: {
      status: outcome.status,
      reason: outcome.reason,
      ...(outcome.status === "SENT" ? { sentAt: asOf } : { sentAt: null }),
    },
  });

  // Law #6 — every send DECISION is recorded with its reason. METADATA ONLY:
  // no subject, no body, no email address (Verify item 12).
  await prisma.auditEvent
    .create({
      data: {
        tenantId: DEFAULT_TENANT_ID,
        actorId: step.prospectId,
        action: "engage-message",
        reason: outcome.reason,
        meta: {
          prospectId: step.prospectId,
          sequenceKey: step.sequenceKey,
          stepKey: step.stepKey,
          templateKey: step.templateKey,
          locale: step.locale,
          status: outcome.status,
          scheduledFor: step.scheduledFor.toISOString(),
        },
      },
    })
    .catch((e) => console.error("[engage] audit write failed", e instanceof Error ? e.message : ""));

  return outcome;
}

/** The four merge fields (§3) plus the structural unsubscribe URL. Nothing
 *  else is available to a template, by construction. */
async function mergeVarsFor(p: ProspectRow): Promise<MergeVars> {
  let slug: string | null = null;
  if (p.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: p.tenantId }, select: { slug: true } }).catch(() => null);
    slug = t?.slug ?? null;
  }
  return {
    firstName: firstNameOf(p.name) || p.name,
    referralCode: p.referralCode,
    signupUrl: engageSignupUrl(p.referralCode),
    portalUrl: engagePortalUrl(slug),
    unsubscribeUrl: engageUnsubscribeUrl(unsubscribeToken(p.id)),
  };
}

// ---------------------------------------------------------------------------
// §6 — suppression. Permanent, server-side, and idempotent: a second click
// changes nothing and says so.
// ---------------------------------------------------------------------------

export type UnsubscribeOutcome = "done" | "already" | "invalid";

export async function unsubscribeProspect(prospectId: string | null): Promise<UnsubscribeOutcome> {
  if (!prospectId) return "invalid";
  const p = await prisma.practitionerProspect
    .findUnique({ where: { id: prospectId }, select: { id: true, unsubscribedAt: true } })
    .catch(() => null);
  if (!p) return "invalid";
  if (p.unsubscribedAt) return "already";
  await prisma.practitionerProspect.update({
    where: { id: p.id },
    data: { unsubscribedAt: new Date() },
  });
  await prisma.auditEvent
    .create({
      data: {
        tenantId: DEFAULT_TENANT_ID,
        actorId: p.id,
        action: "engage-unsubscribe",
        reason: "one-click unsubscribe honoured",
        meta: { prospectId: p.id },
      },
    })
    .catch(() => {});
  return "done";
}

// ---------------------------------------------------------------------------
// §5 — what the admin surface reads.
// ---------------------------------------------------------------------------

export type MessageHistoryRow = {
  id: string;
  prospectId: string;
  sequenceKey: string;
  stepKey: string;
  locale: string;
  status: string;
  reason: string | null;
  scheduledFor: Date;
  sentAt: Date | null;
  createdAt: Date;
};

export async function messageHistory(prospectIds: string[]): Promise<Map<string, MessageHistoryRow[]>> {
  const out = new Map<string, MessageHistoryRow[]>();
  if (prospectIds.length === 0) return out;
  const rows = (await prisma.prospectMessage.findMany({
    where: { prospectId: { in: prospectIds } },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: 2000,
  })) as MessageHistoryRow[];
  for (const r of rows) {
    const list = out.get(r.prospectId) ?? [];
    list.push(r);
    out.set(r.prospectId, list);
  }
  return out;
}

/** The queue: what is due next, whether or not it is due yet. */
export async function engageQueue(opts: { asOf?: Date; limit?: number } = {}): Promise<{
  asOf: Date;
  switches: EngageSwitches;
  configured: boolean;
  steps: PlannedStep[];
}> {
  const plan = await planEngage({ asOf: opts.asOf, includeUpcoming: true, limit: opts.limit });
  return {
    ...plan,
    steps: plan.steps.filter((s) => !s.existingStatus || !TERMINAL.has(s.existingStatus)),
  };
}
