import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { completeAppointment, clientLabel } from "@/lib/appointments";
import { packageCounters, activatePackageForCharge } from "@/lib/packages";
import { getPaymentOrderId, getOrderReferenceId } from "@/lib/square";
import { sendReceiptForCharge } from "@/lib/receipts";
import { sendEmail } from "@/lib/notify";
import { pickLocale, paymentReminderEmail, payeeInvoiceEmail, packageCompletedEmail, sessionReminderEmail } from "@/lib/email-copy";
import { chargeEmailContext } from "@/lib/invoice-context";
import { getBaseUrlSafe } from "@/lib/base-url";
import { sendPushToUser } from "@/lib/push";
import { getOrCreateConfig, getPractitioner, formatInZone, zoneAbbrev } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// C13-PKG §9 — the scheduler, now required: Railway cron → this one hardened
// tick. Authenticated (JOBS_SECRET), idempotent, safe to re-run: every step
// re-derives its work from state and marks what it did, so a double-fire does
// nothing twice. Each step is isolated — one failure never starves the rest.

const GRACE_MS = 2 * 3_600_000; // auto-complete at endAt + 2h (§5)
const REMIND_GAP_MS = 7 * 86_400_000; // second nudge +7 days, then stop (§9)

function authorized(req: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const report: Record<string, number | string> = {};

  // 1. Auto-complete past sessions (§5): SCHEDULED, endAt + 2h grace elapsed.
  //    Completion consumes the reserved credit; her override stays one tap.
  try {
    const due = await prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        kind: "SESSION",
        clientId: { not: null },
        endAt: { lt: new Date(now.getTime() - GRACE_MS) },
      },
      select: { id: true },
      take: 200,
    });
    let done = 0;
    for (const a of due) {
      const r = await completeAppointment(a.id, "system-autocomplete");
      if (r.ok) done++;
    }
    report.autoCompleted = done;
  } catch (e) {
    report.autoCompleted = "error";
    console.error("[tick] auto-complete failed", e instanceof Error ? e.message : "");
  }

  // 2. Renewal moment #1 (§6): the practitioner hears BEFORE the last session —
  //    the renewal conversation belongs in the room.
  try {
    const practitioner = await prisma.user.findFirst({
      where: { role: "PRACTITIONER" },
      select: { id: true, email: true },
    });
    let notices = 0;
    if (practitioner?.email) {
      const active = await prisma.package.findMany({
        where: { status: "ACTIVE", lastSessionNoticeAt: null },
        include: { credits: { select: { state: true } } },
      });
      for (const pkg of active) {
        const c = packageCounters(pkg);
        // Fully booked out and one session away from the end: the next
        // (or currently reserved last) session is the final one.
        if (c.available === 0 && c.reserved > 0 && c.used + c.reserved >= pkg.sessionsTotal) {
          const client = await prisma.user.findUnique({
            where: { id: pkg.clientId },
            select: { name: true, email: true },
          });
          if (!client) continue;
          await sendEmail({
            to: practitioner.email,
            subject: `${clientLabel(client)}'s next session is the last of ${pkg.sessionsTotal}`,
            text:
              `${clientLabel(client)} has one session left on the ${pkg.sessionsTotal}-session package.\n\n` +
              `If continuing feels right, the renewal conversation belongs in the room — ` +
              `you'll find Send renewal and Create invoice on their Billing tab afterwards.`,
          });
          await prisma.package.update({
            where: { id: pkg.id },
            data: { lastSessionNoticeAt: now },
          });
          notices++;
        }
      }
    }
    report.lastSessionNotices = notices;
  } catch (e) {
    report.lastSessionNotices = "error";
    console.error("[tick] renewal notice failed", e instanceof Error ? e.message : "");
  }

  // 3. Renewal moment #2 (§6): package completed — tell her, and (warmly,
  //    suppressibly, in their language) the client. Never dunning.
  try {
    const practitioner = await prisma.user.findFirst({
      where: { role: "PRACTITIONER" },
      select: { email: true },
    });
    const completed = await prisma.package.findMany({
      where: { status: "COMPLETED", completedNoticeAt: null },
    });
    let notices = 0;
    for (const pkg of completed) {
      const client = await prisma.user.findUnique({
        where: { id: pkg.clientId },
        select: { name: true, email: true, locale: true, profile: { select: { renewalMessagesMuted: true } } },
      });
      if (!client) continue;
      if (practitioner?.email) {
        await sendEmail({
          to: practitioner.email,
          subject: `${clientLabel(client)} has completed the ${pkg.sessionsTotal}-session package`,
          text:
            `${clientLabel(client)} just completed all ${pkg.sessionsTotal} sessions.\n\n` +
            `From their Billing tab you can send a renewal note or create an invoice — ` +
            `or let the conversation happen in person. Your call, always.`,
        });
      }
      if (client.email && !client.profile?.renewalMessagesMuted) {
        const mail = packageCompletedEmail(pickLocale(client.locale), {
          sessionsTotal: pkg.sessionsTotal,
        });
        await sendEmail({ to: client.email, subject: mail.subject, text: mail.text });
      }
      await prisma.package.update({
        where: { id: pkg.id },
        data: { completedNoticeAt: now },
      });
      notices++;
    }
    report.completionNotices = notices;
  } catch (e) {
    report.completionNotices = "error";
    console.error("[tick] completion notice failed", e instanceof Error ? e.message : "");
  }

  // 4. Package expiry (§12 — policy is hers; expiresAt only set if she uses it).
  try {
    const expired = await prisma.package.updateMany({
      where: { status: "ACTIVE", expiresAt: { not: null, lt: now } },
      data: { status: "EXPIRED" },
    });
    report.expired = expired.count;
  } catch {
    report.expired = "error";
  }

  // 5b. EMAIL-SPEC #10 — the 24h session reminder (once per appointment).
  //     Time + join link + the "free up to 24 hours" line, in their language.
  try {
    const practitionerUser = await getPractitioner();
    const config = practitionerUser ? await getOrCreateConfig(practitionerUser.id) : null;
    let sent = 0;
    if (config) {
      const soon = await prisma.appointment.findMany({
        where: {
          status: "SCHEDULED",
          kind: "SESSION",
          clientId: { not: null },
          reminderSentAt: null,
          startAt: { gt: now, lt: new Date(now.getTime() + 24 * 3_600_000) },
        },
        include: { client: { select: { id: true, email: true, locale: true } } },
        take: 50,
      });
      for (const a of soon) {
        if (!a.client) continue;
        const locale = pickLocale(a.client.locale);
        const when = `${formatInZone(a.startAt, config.timezone, {
          weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
          locale: locale === "es" ? "es-419" : "en-US",
        })} ${zoneAbbrev(a.startAt, config.timezone)}`;
        if (a.client.email) {
          const mail = sessionReminderEmail(locale, {
            when,
            videoUrl: a.location === "VIRTUAL" ? a.videoUrl : null,
          });
          await sendEmail({ to: a.client.email, subject: mail.subject, text: mail.text });
        }
        await sendPushToUser(a.client.id, {
          title: locale === "es" ? "Tu sesión es mañana" : "Your session is tomorrow",
          body: when,
          url: "/space/schedule",
        });
        await prisma.appointment.update({
          where: { id: a.id },
          data: { reminderSentAt: now },
        });
        sent++;
      }
    }
    report.sessionReminders = sent;
  } catch (e) {
    report.sessionReminders = "error";
    console.error("[tick] session reminders failed", e instanceof Error ? e.message : "");
  }

  // 5. Auto payment reminders (§9): opt-in, her tone, never a cascade —
  //    at dueAt, once more +7 days, then stop. Per-client mute respected.
  //    EMAIL-SPEC §5 quiet hours: money nudges only 9:00–19:00 her time.
  try {
    const setting = await prisma.practiceSetting.findUnique({ where: { key: "autoPayReminders" } });
    const practitionerUser = await getPractitioner();
    const config = practitionerUser ? await getOrCreateConfig(practitionerUser.id) : null;
    const hour = config ? Number(formatInZone(now, config.timezone, { hour: "numeric", hour12: false })) : 12;
    const inQuietHours = hour < 9 || hour >= 19;
    let sent = 0;
    if (setting?.value === "on" && !inQuietHours) {
      const candidates = await prisma.charge.findMany({
        where: {
          status: "DUE",
          dueAt: { lt: now },
          remindCount: { lt: 2 },
        },
        take: 100,
      });
      const emailBase = getBaseUrlSafe();
      for (const charge of candidates) {
        if (charge.remindCount === 1 && charge.lastRemindedAt &&
            now.getTime() - charge.lastRemindedAt.getTime() < REMIND_GAP_MS) continue;
        const muted = await prisma.clientProfile.findUnique({
          where: { userId: charge.clientId },
          select: { paymentRemindersMuted: true },
        });
        if (muted?.paymentRemindersMuted) continue;
        // The reminder carries the invoice: details, PDF, and the pay button.
        const ctx = await chargeEmailContext(charge, emailBase);
        if (!ctx.client?.email) continue;
        const mail = paymentReminderEmail(ctx.client.locale, {
          description: charge.description,
          amount: ctx.amount,
          due: ctx.dueDateText,
        });
        await sendEmail({
          to: ctx.client.email,
          subject: mail.subject,
          text: mail.text,
          attachments: [ctx.attachment],
          envelope: {
            locale: ctx.client.locale,
            heading: mail.heading,
            paragraphs: mail.paragraphs,
            ...(ctx.payUrl ? { button: { label: mail.buttonLabel, url: ctx.payUrl } } : {}),
          },
        });
        if (ctx.payee) {
          const payeeMail = payeeInvoiceEmail(ctx.client.locale, {
            kind: "reminder",
            payeeName: ctx.payee.name,
            clientName: ctx.client.name ?? "your client",
            description: charge.description,
            amount: ctx.amount,
            due: ctx.dueDateText,
          });
          await sendEmail({
            to: ctx.payee.email,
            subject: payeeMail.subject,
            text: payeeMail.paragraphs.join("\n\n"),
            attachments: [ctx.attachment],
            envelope: {
              locale: ctx.client.locale,
              heading: payeeMail.heading,
              paragraphs: payeeMail.paragraphs,
              ...(ctx.payUrl ? { button: { label: payeeMail.buttonLabel, url: ctx.payUrl } } : {}),
            },
          });
        }
        await prisma.charge.update({
          where: { id: charge.id },
          data: { lastRemindedAt: now, remindCount: { increment: 1 } },
        });
        sent++;
      }
    }
    report.remindersSent = sent;
  } catch (e) {
    report.remindersSent = "error";
    console.error("[tick] reminders failed", e instanceof Error ? e.message : "");
  }

  // 6. Self-healing reconciliation: an unmatched Square payment that traces
  //    back to one of our charges (payment → order → reference_id) settles it
  //    without waiting for her to press Match. Catches invoice payments whose
  //    webhook events were missed, and heals historical ones.
  try {
    const unmatched = await prisma.externalPayment.findMany({
      where: { matchedChargeId: null, dismissedAt: null },
      take: 20,
    });
    let matched = 0;
    for (const ext of unmatched) {
      const orderId = await getPaymentOrderId(ext.squarePaymentId);
      if (!orderId) continue;
      const refId = await getOrderReferenceId(orderId);
      const charge = refId
        ? await prisma.charge.findUnique({ where: { id: refId } })
        : null;
      if (!charge) continue;
      if (charge.status === "DUE" || charge.status === "PENDING") {
        const paid = await prisma.charge.update({
          where: { id: charge.id },
          data: {
            status: "PAID",
            paidAt: ext.receivedAt,
            paidVia: "square-invoice",
            squarePaymentId: ext.squarePaymentId,
            lastActionById: "system-reconcile",
          },
        });
        await activatePackageForCharge(paid);
        await sendReceiptForCharge(paid);
      } else if (charge.squarePaymentId && charge.squarePaymentId !== ext.squarePaymentId) {
        // Settled by a different payment — leave this one to her judgment.
        continue;
      }
      await prisma.externalPayment.update({
        where: { id: ext.id },
        data: { matchedChargeId: charge.id },
      });
      matched++;
      console.log(`[tick] reconciled payment=${ext.squarePaymentId} charge=${charge.id}`);
    }
    report.reconciled = matched;
  } catch (e) {
    report.reconciled = "error";
    console.error("[tick] reconcile failed", e instanceof Error ? e.message : "");
  }

  // 6a2. SESSION-PIPELINE §8 backstop — a webhook that never arrived: any
  //      capture still TRANSCRIBING after 30 minutes gets its status polled
  //      directly (completeCapture is idempotent and handles pending/error).
  try {
    const stuck = await prisma.sessionCapture.findMany({
      where: { status: "TRANSCRIBING", providerJobId: { not: null }, updatedAt: { lt: new Date(now.getTime() - 30 * 60_000) } },
      select: { id: true },
      take: 20,
    });
    const { completeCapture } = await import("@/lib/capture");
    for (const c of stuck) await completeCapture(c.id).catch(() => {});
    report.capturesPolled = stuck.length;
  } catch (e) {
    report.capturesPolled = "error";
    console.error("[tick] capture backstop failed", e instanceof Error ? e.message : "");
  }

  // 6b. Payment-token health (CLAUDE-BILLING §3.3): proactive refresh for
  //     every tenant's connected account; failures flip to NEEDS_RECONNECT.
  try {
    const { refreshDueTokens } = await import("@/lib/payments/refresh");
    const r = await refreshDueTokens(now);
    report.paymentTokens = `refreshed=${r.refreshed} flagged=${r.flagged}`;
  } catch (e) {
    report.paymentTokens = "error";
    console.error("[tick] payment token refresh failed", e instanceof Error ? e.message : "");
  }

  // 6c. Billing grace sweep (CLAUDE-BILLING §4.4): PAST_DUE past its
  //     14-day grace window becomes SUSPENDED (soft gates only — reading,
  //     exporting, and client logins stay untouched).
  try {
    const { sweepBillingGrace, pruneWebhookEvents } = await import("@/lib/billing/lifecycle");
    const s = await sweepBillingGrace();
    const pr = await pruneWebhookEvents(now);
    report.billingSweep = `suspended=${s.suspended} webhooksPruned=${pr.pruned}`;
  } catch (e) {
    report.billingSweep = "error";
    console.error("[tick] billing grace sweep failed", e instanceof Error ? e.message : "");
  }

  // 6d. Reading retry (PLATFORM Phase 3): parked PENDING_RETRY readings get
  //     another chance, bounded per tick; the cache keeps this cheap.
  try {
    const { retryPendingReadings } = await import("@/lib/readings/compute");
    const rr = await retryPendingReadings();
    if (rr.retried > 0) report.readingRetries = `retried=${rr.retried} recovered=${rr.recovered}`;
  } catch (e) {
    report.readingRetries = "error";
    console.error("[tick] reading retry failed", e instanceof Error ? e.message : "");
  }

  // 7. Null-tenant invariant audit (platform): zero rows may carry a null
  //    tenantId after migration 36. Any drift is loud — it means a write
  //    slipped past stamping (the documented nested-writes gap).
  try {
    const { auditNullTenantRows } = await import("@/lib/tenancy/stamp-audit");
    const drift = await auditNullTenantRows();
    report.tenantStampDrift = drift.total;
    if (drift.total > 0) {
      console.error(`[tick] TENANT-STAMP DRIFT: ${drift.total} null-tenant row(s) ${JSON.stringify(drift.byModel)}`);
    }
  } catch (e) {
    report.tenantStampDrift = "error";
    console.error("[tick] tenant-stamp audit failed", e instanceof Error ? e.message : "");
  }

  console.log(`[tick] ${JSON.stringify(report)}`);
  return NextResponse.json({ ok: true, at: now.toISOString(), ...report });
}
