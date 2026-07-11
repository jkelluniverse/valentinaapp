import Link from "next/link";
import { notFound } from "next/navigation";
import type { RecordKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getClientRecord } from "@/lib/client-record";
import { MoodDots, groupByDay, formatDay } from "@/components/entries";
import { RecordCard, ThemeDots, MoodRiver } from "@/components/record";
import { promptKindLabel } from "@/lib/prompt-meta";
import { getOrCreateConfig, getPractitioner, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { listEnrolledCourses } from "@/lib/courses";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { formatMoney } from "@/lib/billing";
import { markChargePaid, waiveCharge, remindCharge } from "../../billing/actions";
import { clientNotes } from "@/lib/notes";
import { JotBox } from "@/components/JotBox";
import { NoteRow } from "@/components/NoteRow";
import { createJot } from "../../notes/actions";
import { AssignForm } from "./AssignForm";
import { assignPrompt, assignWorksheet, cancelForClient, setClientStage } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  COMPLETED: "Answered",
  DISMISSED: "Set aside",
};

const TABS = [
  { key: "record", label: "Record" },
  { key: "margins", label: "Margins" },
  { key: "prep", label: "Prep" },
  { key: "between", label: "Between" },
  { key: "courses", label: "Courses" },
  { key: "profile", label: "Profile" },
  { key: "billing", label: "Billing" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function relDay(d: Date | null): string {
  if (!d) return "not yet";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d).toLowerCase();
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

// A2 — The Portrait. One person, whole: an editorial header, felt rollups, and
// depth on demand through tabs. The two verbs anchor the work.
export default async function Portrait({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: {
    tab?: string;
    theme?: string;
    sent?: string;
    error?: string;
    booked?: string;
    staged?: string;
    noteTag?: string;
  };
}) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      consentAt: true,
      aiConsentAt: true,
      createdAt: true,
    },
  });
  if (!client) notFound();

  const tab: TabKey = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as TabKey)
    : "record";
  const themeFilter = searchParams.theme || undefined;
  const base = `/practitioner/clients/${client.id}`;
  const tabHref = (t: TabKey) => `${base}?tab=${t}`;

  const practitioner = await getPractitioner();
  const schedConfig = practitioner ? await getOrCreateConfig(practitioner.id) : null;

  const [rec, profile, hd, upcomingSessions, latestPrep, courses] = await Promise.all([
    getClientRecord(client.id, themeFilter ? { tag: themeFilter } : {}),
    prisma.clientProfile.findUnique({ where: { userId: client.id } }),
    prisma.humanDesignChart.findUnique({
      where: { userId: client.id },
      select: { type: true, profile: true, authority: true },
    }),
    prisma.appointment.findMany({
      where: { clientId: client.id, status: "SCHEDULED", startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
    }),
    prisma.sessionPrep.findFirst({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, referralFlag: true, practitionerNotes: true },
    }),
    listEnrolledCourses(client.id),
  ]);

  const stageLabel = programStageLabel(profile?.stage);
  const since = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(client.createdAt);
  const groups = groupByDay(rec.timeline);
  const nextSession = upcomingSessions[0];

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/practitioner/clients"
        className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
      >
        ← clients
      </Link>

      {/* Header — the Portrait settles: name, then the rule, then rollups. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 gentle-rise">
          <h1 className="font-headline text-[2.25rem] font-medium text-ink-strong">
            {client.name || client.email}
          </h1>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-pill border border-mocha px-3 py-1 text-xs font-medium text-mocha transition-colors hover:bg-blush">
              {stageLabel ?? "Set stage"}
            </summary>
            <form
              action={setClientStage.bind(null, client.id)}
              className="absolute left-0 top-9 z-10 flex w-72 flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <input type="hidden" name="back" value={tabHref(tab)} />
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">Program stage</span>
                <select
                  name="stage"
                  defaultValue={profile?.stage ?? PROGRAM_STAGES[0].key}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                >
                  {PROGRAM_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="text"
                name="note"
                placeholder="A word on why (optional)"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <button className="self-start rounded-md bg-wine px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                Move stage
              </button>
            </form>
          </details>
        </div>
        <p className="gentle-rise text-[15px] text-slate">
          with you since {since} · last wrote {relDay(rec.cadence.lastActive)}
          {!client.consentAt && " · no consent on file"}
        </p>
        <div className="h-px w-16 origin-left bg-mocha rule-draw" />
      </div>

      {/* Rollups */}
      {rec.counts.total > 0 && (
        <div className="flex flex-col gap-4 gentle-rise" style={{ animationDelay: "200ms" }}>
          <ThemeDots themes={rec.themes} clientId={client.id} />
          <MoodRiver trend={rec.moodTrend} />
        </div>
      )}

      {/* Banners */}
      {searchParams.sent && <Banner>Sent — it&apos;s waiting in their space.</Banner>}
      {searchParams.booked === "1" && <Banner>Session booked — a note is on its way.</Banner>}
      {searchParams.booked === "cancelled" && <Banner>Session cancelled.</Banner>}
      {searchParams.staged && <Banner>Stage updated — it&apos;s on their journey too.</Banner>}
      {searchParams.error === "prompt" && <Banner>That library item isn&apos;t available.</Banner>}

      {/* The two verbs */}
      <div className="flex flex-wrap items-center gap-3 gentle-rise" style={{ animationDelay: "280ms" }}>
        <Link
          href={`${base}/prep`}
          className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
        >
          Prepare for session
        </Link>
        <Link
          href={`${base}/book`}
          className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          Book next session
        </Link>
        {nextSession && schedConfig && (
          <span className="text-[13px] text-whisper">
            next · {formatInZone(nextSession.startAt, schedConfig.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="gentle-rise flex flex-wrap gap-1 border-b border-line" style={{ animationDelay: "340ms" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-wine text-wine"
                : "border-transparent text-slate hover:text-wine"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="gentle-rise" style={{ animationDelay: "400ms" }}>
        {tab === "record" && (
          <section className="flex flex-col gap-6">
            {themeFilter && (
              <p className="flex items-center gap-3 text-sm text-slate">
                Filtered to <span className="font-medium text-wine">{themeFilter}</span>
                <Link href={tabHref("record")} className="text-[13px] underline-offset-4 hover:text-wine hover:underline">
                  clear
                </Link>
              </p>
            )}
            {groups.length === 0 ? (
              <p className="text-ink">
                {themeFilter ? "Nothing under this theme." : "Nothing recorded yet."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.day} className="flex flex-col gap-3">
                  <h3 className="text-eyebrow font-semibold uppercase text-mocha">{group.day}</h3>
                  {group.items.map((item) => (
                    <RecordCard key={item.id} item={item} />
                  ))}
                </div>
              ))
            )}
          </section>
        )}

        {tab === "prep" && (
          <section className="flex flex-col gap-4">
            {!client.aiConsentAt ? (
              <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
                <p className="max-w-prose text-ink">
                  {client.name || "This client"} hasn&apos;t agreed to AI-assisted review, so
                  session prep is off for them. They can turn it on from their own space.
                </p>
              </div>
            ) : latestPrep ? (
              <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
                <p className="text-ink">
                  Last prepared {relDay(latestPrep.createdAt)}
                  {latestPrep.referralFlag && (
                    <span className="ml-2 font-medium text-rose">referral flagged</span>
                  )}
                  {latestPrep.practitionerNotes && <span className="ml-2 text-slate">· annotated</span>}
                </p>
                <Link
                  href={`${base}/prep`}
                  className="mt-4 inline-block rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
                >
                  Open the Prep Room →
                </Link>
              </div>
            ) : (
              <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
                <p className="text-ink">No preparation yet.</p>
                <Link
                  href={`${base}/prep`}
                  className="mt-4 inline-block rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
                >
                  Open the Prep Room →
                </Link>
              </div>
            )}
          </section>
        )}

        {tab === "between" && (
          <BetweenTab
            clientId={client.id}
            back={tabHref("between")}
          />
        )}

        {tab === "courses" && (
          <section className="flex flex-col gap-3">
            {courses.length === 0 ? (
              <p className="text-ink">
                Not enrolled in any course yet — enroll them from a{" "}
                <Link href="/practitioner/courses" className="font-medium text-wine underline-offset-4 hover:underline">
                  course builder
                </Link>
                .
              </p>
            ) : (
              courses.map((c) => (
                <div
                  key={c.courseId}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-5 shadow-soft"
                >
                  <span className="font-medium text-ink-strong">{c.title}</span>
                  <span className="text-sm text-slate">
                    {c.completed} of {c.total} lessons
                  </span>
                  <span className="ml-auto text-[13px] text-whisper">{c.percent}% along</span>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "profile" && (
          <section className="flex flex-col gap-4">
            <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Stage" value={stageLabel ?? "—"} />
                <Row label="Consent" value={client.consentAt ? "on file" : "not on file"} />
                <Row label="AI review" value={client.aiConsentAt ? "allowed" : "off"} />
                <Row label="Intake" value={profile?.intakeCompletedAt ? `done ${profile.intakeCompletedAt.toISOString().slice(0, 10)}` : "not yet"} />
                {profile?.birthDate && (
                  <Row
                    label="Born"
                    value={`${profile.birthDate.toISOString().slice(0, 10)}${profile.birthPlace ? ` · ${profile.birthPlace}` : ""}`}
                  />
                )}
                {hd?.type && <Row label="Human Design" value={`${hd.type}${hd.profile ? ` · ${hd.profile}` : ""}${hd.authority ? ` · ${hd.authority}` : ""}`} />}
              </dl>
            </div>
            <Link
              href={`${base}/design`}
              className="inline-block self-start rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
            >
              Full profile, chart &amp; integrative map →
            </Link>
          </section>
        )}

        {tab === "margins" && (
          <MarginsTab clientId={client.id} clientName={client.name || client.email} tag={searchParams.noteTag} />
        )}

        {tab === "billing" && (
          <BillingTab clientId={client.id} back={tabHref("billing")} />
        )}
      </div>

      {/* Sessions management (compact, always reachable under the file) */}
      {upcomingSessions.length > 0 && schedConfig && (
        <section className="flex flex-col gap-2 border-t border-line pt-6">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Upcoming sessions</p>
          {upcomingSessions.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink">
                {formatInZone(a.startAt, schedConfig.timezone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{" "}
                <span className="text-whisper">{zoneAbbrev(a.startAt, schedConfig.timezone)}</span>
              </span>
              <span className="text-[13px] text-whisper">{a.location === "VIRTUAL" ? "virtual" : "in person"}</span>
              <span className="ml-auto flex items-center gap-4">
                {a.location === "VIRTUAL" && a.videoUrl && (
                  <a href={a.videoUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-wine underline-offset-4 hover:underline">
                    Join
                  </a>
                )}
                <form action={cancelForClient.bind(null, client.id, a.id)}>
                  <button className="text-slate underline-offset-4 hover:text-wine hover:underline">Cancel</button>
                </form>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-eyebrow font-semibold uppercase text-mocha">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

// Between-sessions: send prompts/worksheets + the history of both.
async function BetweenTab({ clientId, back }: { clientId: string; back: string }) {
  const [assignments, library, worksheets, worksheetAssignments] = await Promise.all([
    prisma.assignment.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: { prompt: true, response: true },
      take: 100,
    }),
    prisma.prompt.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, kind: true },
    }),
    prisma.worksheet.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
    prisma.worksheetAssignment.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: { worksheet: { select: { title: true } }, response: { select: { id: true } } },
      take: 50,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <AssignForm action={assignPrompt.bind(null, clientId)} library={library} back={back} />
      </div>
      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        {worksheets.length === 0 ? (
          <p className="text-sm text-ink">
            No worksheets yet — draft one in the{" "}
            <Link href="/practitioner/worksheets/new" className="font-medium text-wine underline-offset-4 hover:underline">
              worksheet studio
            </Link>
            .
          </p>
        ) : (
          <form action={assignWorksheet.bind(null, clientId)} className="flex flex-col gap-4">
            <input type="hidden" name="back" value={back} />
            <label className="flex flex-col gap-1.5">
              <span className="text-eyebrow font-semibold uppercase text-mocha">A worksheet</span>
              <select
                name="worksheetId"
                required
                className="rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
              >
                {worksheets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-eyebrow font-semibold uppercase text-mocha">
                Due <span className="normal-case tracking-normal text-slate">(optional)</span>
              </span>
              <input
                type="date"
                name="dueAt"
                className="rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
              />
            </label>
            <button className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
              Send worksheet
            </button>
          </form>
        )}
      </div>

      {(assignments.length > 0 || worksheetAssignments.length > 0) && (
        <div className="flex flex-col gap-3">
          {worksheetAssignments.map((wa) => (
            <div key={wa.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-5 shadow-soft">
              <span className="inline-flex items-center rounded-pill bg-blush-deep px-2.5 py-0.5 text-xs font-medium text-wine">
                Worksheet
              </span>
              <span className="font-medium text-ink-strong">{wa.worksheet.title}</span>
              <span className="ml-auto flex items-center gap-4 text-sm">
                <span className={`text-xs font-medium ${wa.status === "COMPLETED" ? "text-wine" : "text-slate"}`}>
                  {STATUS_LABEL[wa.status] ?? wa.status}
                  {wa.dueAt && wa.status === "PENDING" ? ` · due ${formatDay(wa.dueAt)}` : ""}
                </span>
                {wa.response && (
                  <Link href={`/practitioner/clients/${clientId}/worksheets/${wa.id}`} className="font-medium text-wine underline-offset-4 hover:underline">
                    Read response
                  </Link>
                )}
              </span>
            </div>
          ))}
          {assignments.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-pill border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha">
                  {promptKindLabel(a.prompt.kind)}
                </span>
                <span className="font-medium text-ink-strong">{a.prompt.title}</span>
                <span className={`ml-auto text-xs font-medium ${a.status === "COMPLETED" ? "text-wine" : "text-slate"}`}>
                  {STATUS_LABEL[a.status]}
                  {a.dueAt && a.status === "PENDING" ? ` · due ${formatDay(a.dueAt)}` : ""}
                </span>
              </div>
              {a.response && (
                <div className="flex flex-col gap-2 rounded-md bg-cream p-4">
                  <div className="flex items-center gap-3">
                    <MoodDots mood={a.response.mood} />
                    <span className="ml-auto text-xs text-slate">{formatDay(a.response.completedAt)}</span>
                  </div>
                  {a.response.body && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{a.response.body}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// C14 — the Margins tab: her private notes on this client, a timeline of jots
// and notes, filterable by theme tag. Never client-visible.
async function MarginsTab({
  clientId,
  clientName,
  tag,
}: {
  clientId: string;
  clientName: string;
  tag?: string;
}) {
  const notes = await clientNotes(clientId, tag);
  const tags = [...new Set(notes.flatMap((n) => n.tags))].sort();
  const groups = groupByDay(notes.map((n) => ({ ...n, occurredAt: n.createdAt })));
  const marginsBase = `/practitioner/clients/${clientId}?tab=margins`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <JotBox action={createJot.bind(null, clientId)} placeholder={`a jot about ${clientName}…`} />
        <Link
          href="/practitioner/notes"
          className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
        >
          the whole notebook →
        </Link>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={marginsBase}
            className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${!tag ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
          >
            All
          </Link>
          {tags.map((t) => (
            <Link
              key={t}
              href={`${marginsBase}&noteTag=${encodeURIComponent(t)}`}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${tag === t ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-ink">
          {tag ? "No notes under this theme yet." : "No notes yet — jot something above, even mid-session."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.day} className="flex flex-col">
              <h3 className="mb-1 text-eyebrow font-semibold uppercase text-mocha">{group.day}</h3>
              {group.items.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function BillingTab({ clientId, back }: { clientId: string; back: string }) {
  const charges = await prisma.charge.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (charges.length === 0) {
    return <p className="text-ink">No charges yet — they appear as sessions are booked.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {charges.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-5 py-3 text-sm shadow-soft">
          <span className="font-medium text-ink-strong">{c.description}</span>
          <span className="text-ink">{formatMoney(c.amountCents, c.currency)}</span>
          <span className="text-slate">
            {c.status === "PAID"
              ? `paid${c.paidAt ? ` · ${c.paidAt.toISOString().slice(0, 10)}` : ""}`
              : c.status === "DUE"
                ? `awaiting${c.dueAt ? ` · due ${c.dueAt.toISOString().slice(0, 10)}` : ""}`
                : c.status.toLowerCase()}
          </span>
          {(c.status === "DUE" || c.status === "PENDING") && (
            <span className="ml-auto flex items-center gap-3">
              <form action={remindCharge.bind(null, c.id)}>
                <input type="hidden" name="back" value={back} />
                <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">Remind</button>
              </form>
              <form action={markChargePaid.bind(null, c.id)}>
                <input type="hidden" name="back" value={back} />
                <button className="font-medium text-wine underline-offset-4 hover:underline">Mark paid</button>
              </form>
              <form action={waiveCharge.bind(null, c.id)}>
                <input type="hidden" name="back" value={back} />
                <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">Waive</button>
              </form>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
