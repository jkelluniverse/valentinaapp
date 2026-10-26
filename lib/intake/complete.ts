import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/tenancy";
import { getAnswers, emitEvent } from "@/lib/intake/engine";

// CLIENT-ONBOARDING §5 — completion orchestration. Two load-bearing
// intersections live here:
//   (1) the recording ConsentRecord is created HERE, and it is the SAME
//       RecordingConsent row the session pipeline's consent gate checks
//       (hasRecordingConsent) — not a parallel record.
//   (2) the values-spiral internal scorer AND the birth-data → reading path
//       both fire at completion. For Valentina's tenant the reading path is
//       her in-house chart engine (ensureChart: Human Design + Gene Keys),
//       not the held astrology-api.io ReadingProvider (Platform Phase 3) —
//       her panels compute exactly as they do today (Rule 5.1).
//
// Done never blocks on the fan-out (§3E): the caller commits + marks COMPLETE,
// then fires runCompletionFanout without awaiting. The verify awaits it to
// assert the outputs.

type BirthPlace = { display?: string; lat?: number; lng?: number; tz?: string };

// Commit answers to their destinations, mark the flow COMPLETE, emit the
// event. Fast + synchronous. Returns the clientId for the fan-out —
// or { blocked: "minor" } (Addendum M gate; flow stays IN_PROGRESS).
export async function completeIntake(flowId: string): Promise<{ clientId: string } | { blocked: "minor" } | null> {
  const tenant = await getTenant();
  const flow = await prisma.intakeFlow.findFirst({ where: { id: flowId }, select: { id: true, clientId: true, status: true } });
  if (!flow || flow.status !== "IN_PROGRESS") return null;
  const a = await getAnswers(flowId);
  const clientId = flow.clientId;

  // Identity → User + profile.
  const fullName = typeof a["identity.fullName"] === "string" ? (a["identity.fullName"] as string).trim() : "";
  if (fullName) await prisma.user.update({ where: { id: clientId }, data: { name: fullName } });
  const preferredName = typeof a["identity.preferredName"] === "string" ? (a["identity.preferredName"] as string) : null;

  // Birth data → profile (place carries geocoded lat/lng/tz from the UI's
  // places autocomplete; honor the time-unknown path).
  const place = (a["birth.place"] ?? null) as BirthPlace | string | null;
  const placeObj: BirthPlace = typeof place === "string" ? { display: place } : (place ?? {});
  const birthDateRaw = a["birth.date"];
  const birthDate = typeof birthDateRaw === "string" && birthDateRaw ? new Date(`${birthDateRaw}T00:00:00Z`) : undefined;

  // ADDENDUM M (C20 v3.1) — the platform is adults-only BY DESIGN: consent,
  // safety, and crisis architecture are built for adults, and a minors
  // pathway needs its own product pass. This is the FIRST moment a date of
  // birth is known (invites carry no DOB — deviation noted in the install
  // report), so the gate lives here: under-18 completion is refused with a
  // calm message and Valentina is notified.
  if (birthDate) {
    const age = (Date.now() - birthDate.getTime()) / (365.25 * 86400_000);
    if (age < 18) {
      await emitEvent({ tenantId: tenant.id, clientId, actor: "system", eventKey: "intake.minor_blocked", meta: { flowId } });
      try {
        const practitioner = await prisma.user.findFirst({ where: { role: "PRACTITIONER" }, select: { email: true } });
        if (practitioner?.email) {
          const { sendEmail } = await import("@/lib/notify");
          await sendEmail({
            to: practitioner.email,
            subject: "An intake needs your attention",
            text: "A client's intake indicates they are under 18. The platform doesn't support minor clients yet — this intake was paused, and a guardian arrangement (Addendum M) would need its own process. Please reach out to them directly.",
          });
        }
      } catch {
        /* notification is best-effort; the block is the point */
      }
      return { blocked: "minor" }; // flow stays IN_PROGRESS; UI shows the calm message
    }
  }
  const birthTimeRaw = a["birth.time"];
  const timeUnknown = birthTimeRaw === "" || birthTimeRaw == null || birthTimeRaw === "unknown";
  const birthTime = !timeUnknown && typeof birthTimeRaw === "string" ? birthTimeRaw : null;

  const profileData = {
    preferredName: preferredName ?? undefined,
    birthDate,
    birthTime,
    birthTimeUnknown: timeUnknown,
    birthTimePrecision: timeUnknown ? "UNKNOWN" : "EXACT",
    birthPlace: placeObj.display ?? undefined,
    birthLat: placeObj.lat ?? undefined,
    birthLng: placeObj.lng ?? undefined,
    birthTz: placeObj.tz ?? undefined,
    intakeCompletedAt: new Date(),
  };
  await prisma.clientProfile.upsert({
    where: { userId: clientId },
    create: { userId: clientId, ...profileData },
    update: profileData,
  });

  await prisma.intakeFlow.update({ where: { id: flowId }, data: { status: "COMPLETE", completedAt: new Date() } });
  await emitEvent({ tenantId: tenant.id, clientId, actor: "client", eventKey: "intake.completed", meta: { flowId } });
  return { clientId };
}

// The background fan-out (§5.2). Each piece is independently guarded so one
// failure never blocks the others or the client's landing.
export async function runCompletionFanout(flowId: string, clientId: string): Promise<{
  spiralScored: boolean;
  chartComputed: boolean;
  recordingConsent: boolean;
}> {
  const tenant = await getTenant();
  const a = await getAnswers(flowId);
  const out = { spiralScored: false, chartComputed: false, recordingConsent: false };

  // (2a) Internal scorer — the values spiral. Answers are stored under
  // "values.<fieldId>"; the scorer reads bare field ids.
  try {
    const valuesAnswers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) if (k.startsWith("values.")) valuesAnswers[k.slice("values.".length)] = v;
    if (Object.keys(valuesAnswers).length > 0) {
      const { scoreSpiral } = await import("@/lib/spiral");
      const score = scoreSpiral(valuesAnswers as never);
      if (score) {
        const lensData = {
          lens: "SPIRAL" as const,
          sourceType: "ASSESSMENT" as const,
          result: score as unknown as object,
          contentRef: score.contentRef,
          practitionerReviewed: false,
          generatedAt: new Date(),
        };
        await prisma.lensResult.upsert({
          where: { userId_lens: { userId: clientId, lens: "SPIRAL" } },
          create: { userId: clientId, ...lensData },
          update: lensData,
        });
        out.spiralScored = true;
        await emitEvent({ tenantId: tenant.id, clientId, actor: "system", eventKey: "reading.computed", meta: { kind: "values-spiral", provider: "internal" } });
      }
    }
  } catch (e) {
    console.error(`[intake] values scorer failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  // (2b) Birth-data → reading path: her in-house chart engine (HD + Gene
  // Keys). Idempotent; degrades gracefully without a birth time.
  try {
    const profile = await prisma.clientProfile.findUnique({ where: { userId: clientId } });
    if (profile?.birthDate) {
      const { ensureChart } = await import("@/lib/human-design");
      // ensureChart reads the raw ClientProfile row shape.
      const computed = await ensureChart(profile as never);
      out.chartComputed = Boolean(computed);
      if (computed) await emitEvent({ tenantId: tenant.id, clientId, actor: "system", eventKey: "reading.computed", meta: { kind: "chart", provider: "internal" } });
    }
  } catch (e) {
    console.error(`[intake] chart computation failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  // (2d) C20 §2 — the recording-consent trigger: when this intake granted
  // recording consent and a template is toggled for it, send it now.
  try {
    if (a["consent.recording"] === true || a["consent.recording"] === "true") {
      const { fireAgreementTrigger } = await import("@/lib/agreements/triggers");
      await fireAgreementTrigger(tenant.id, "sendOnRecordingConsent", clientId);
    }
  } catch (e) {
    console.error(`[intake] agreement trigger failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  // (2c) PLATFORM Phase 3 — provider-computed modules (western-natal,
  // numerology, …): the orchestrator caches by inputsHash, parks failures
  // as PENDING_RETRY for the tick, and never blocks completion.
  try {
    const { computeReadingsFor } = await import("@/lib/readings/compute");
    const rr = await computeReadingsFor(tenant.id, clientId);
    if (rr.computed > 0) {
      await emitEvent({ tenantId: tenant.id, clientId, actor: "system", eventKey: "reading.computed", meta: { kind: "provider", computed: rr.computed, cached: rr.cached } });
    }
  } catch (e) {
    console.error(`[intake] provider readings failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  // (1) Recording ConsentRecord — the intersection with the session pipeline.
  // This creates the SAME RecordingConsent the pipeline gate reads. Only when
  // the client agreed to the recording terms in the Review step.
  try {
    if (a["consent.recording"] === true || a["consent.recording"] === "true") {
      const { RECORDING_CONSENT_TEXT, RECORDING_CONSENT_VERSION } = await import("@/lib/recording");
      const client = await prisma.user.findUnique({ where: { id: clientId }, select: { locale: true } });
      const lang = client?.locale === "es" ? "es" : "en";
      await prisma.recordingConsent.upsert({
        where: { clientId },
        create: { clientId, version: RECORDING_CONSENT_VERSION, textSnapshot: RECORDING_CONSENT_TEXT[lang], grantedAt: new Date(), revokedAt: null },
        update: { version: RECORDING_CONSENT_VERSION, textSnapshot: RECORDING_CONSENT_TEXT[lang], grantedAt: new Date(), revokedAt: null },
      });
      out.recordingConsent = true;
    }
  } catch (e) {
    console.error(`[intake] recording consent grant failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  return out;
}
