import Link from "next/link";
import { notFound } from "next/navigation";
import type { RecordKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import { MoodDots, groupByDay, formatDay } from "@/components/entries";
import { RecordCard, ThemeDots, MoodRiver } from "@/components/record";
import { promptKindLabel } from "@/lib/prompt-meta";
import { getOrCreateConfig, getPractitioner, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { listEnrolledCourses } from "@/lib/courses";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { formatMoney } from "@/lib/billing";
import { clientPackageSummary } from "@/lib/packages";
import { squareConfigured, squarePublicConfig, getSquareCustomer, listCardsOnFile, ensureSquareCustomer } from "@/lib/square";
import { SquareCardForm } from "@/components/SquareCardForm";
import { markChargePaid, waiveCharge, remindCharge } from "../../billing/actions";
import { clientNotes } from "@/lib/notes";
import { loadGraph } from "@/lib/psyche";
import { NOTES_SOURCE_KEY } from "@/lib/psyche-extract";
import { MapWorkbench } from "@/components/psyche/MapWorkbench";
import { JotBox } from "@/components/JotBox";
import { NoteRow } from "@/components/NoteRow";
import { createJot } from "../../notes/actions";
import { AssignForm } from "./AssignForm";
import {
  assignPrompt,
  assignWorksheet,
  cancelForClient,
  setClientStage,
  sendInvoice,
  updateSquareProfile,
  linkSquareCustomer,
  saveCardOnFile,
  chargeCardOnFile,
  savePayee,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  COMPLETED: "Answered",
  DISMISSED: "Set aside",
};

const TABS = [
  { key: "record", label: "Record" },
  { key: "map", label: "Map" },
  { key: "margins", label: "Margins" },
  { key: "messages", label: "Messages" },
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
    invoice?: string;
    billing?: string;
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
      createdAt: true,
    },
  });
  if (!client) notFound();

  // AMENDMENT-01: one unified consent answers every gate on this file.
  const clientConsent = await hasConsent(client.id);

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

  // Unread messages from this client — shown as a number on the Messages tab.
  // Zero while the tab is open (opening it marks them read).
  const unreadMessages =
    tab === "messages"
      ? 0
      : await prisma.message
          .count({
            where: {
              conversation: { clientId: client.id },
              senderRole: "CLIENT",
              readAt: null,
              deletedAt: null,
            },
          })
          .catch(() => 0);

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

      {/* Header — minimal (AMENDMENT-04 §3): name + stage chip, one line, one verb. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 gentle-rise">
          <h1 className="font-headline text-[1.375rem] font-medium text-ink-strong md:text-[2.25rem]">
            {client.name || client.email}
          </h1>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-pill border border-mocha px-3 py-1 text-xs font-medium text-mocha transition-colors hover:bg-blush">
              {stageLabel ?? "Set stage"} ▾
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
        <p className="gentle-rise text-[12px] text-whisper md:text-[15px] md:text-slate">
          with you since {since} · last wrote {relDay(rec.cadence.lastActive)}
          {!clientConsent && " · no consent on file"}
        </p>
        <div className="hidden h-px w-16 origin-left bg-mocha rule-draw md:block" />
      </div>

      {/* Banners */}
      {searchParams.sent && <Banner>Sent — it&apos;s waiting in their space.</Banner>}
      {searchParams.booked === "1" && <Banner>Session booked — a note is on its way.</Banner>}
      {searchParams.booked === "cancelled" && <Banner>Session cancelled.</Banner>}
      {searchParams.billing === "reminded" && <Banner>Reminder sent.</Banner>}
      {searchParams.billing === "nothingdue" && (
        <Banner>Nothing due on that one — no reminder needed.</Banner>
      )}
      {searchParams.billing === "paid" && <Banner>Marked paid.</Banner>}
      {searchParams.billing === "waived" && <Banner>Waived — noted with your name.</Banner>}
      {searchParams.billing === "charged" && <Banner>Charged to the card on file.</Banner>}
      {searchParams.billing === "chargefail" && (
        <Banner>The card charge didn&apos;t go through — nothing was charged.</Banner>
      )}
      {searchParams.billing === "cardsaved" && <Banner>Card saved on file.</Banner>}
      {searchParams.billing === "squaresaved" && <Banner>Billing details saved to Square.</Banner>}
      {searchParams.billing === "squarefail" && (
        <Banner>Square didn&apos;t accept that change — try again.</Banner>
      )}
      {searchParams.invoice === "sent" && (
        <Banner>Invoice sent — your branded email carries it.</Banner>
      )}
      {searchParams.invoice === "failed" && (
        <Banner>The invoice couldn&apos;t be created — nothing was sent.</Banner>
      )}
      {searchParams.billing === "payeesaved" && (
        <Banner>Payee saved — they&apos;ll receive invoices and reminders too, PDF attached.</Banner>
      )}
      {searchParams.billing === "payeecleared" && <Banner>Payee removed.</Banner>}
      {searchParams.billing === "payeebad" && (
        <Banner>A payee needs both a name and a valid email.</Banner>
      )}
      {searchParams.staged && <Banner>Stage updated — it&apos;s on their journey too.</Banner>}
      {searchParams.error === "prompt" && <Banner>That library item isn&apos;t available.</Banner>}
      {searchParams.invoice === "bad" && (
        <Banner>A custom invoice needs a description and an amount above zero.</Banner>
      )}
      {searchParams.invoice === "square" && (
        <Banner>Square couldn&apos;t place this client just now — try again in a moment.</Banner>
      )}
      {searchParams.invoice === "config" && (
        <Banner>Square isn&apos;t connected yet, so invoices can&apos;t be sent from here.</Banner>
      )}

      {/* ONE verb + a quiet ⋯ menu (Book next moved there, AMENDMENT-04 §3). */}
      <div className="flex items-center gap-2 gentle-rise" style={{ animationDelay: "280ms" }}>
        <Link
          href={`${base}/prep`}
          className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-wine px-5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark sm:flex-none"
        >
          Prepare for session
        </Link>
        <details className="relative">
          <summary
            aria-label="More actions"
            className="flex min-h-[40px] cursor-pointer list-none items-center rounded-lg border border-line px-3 text-lg leading-none text-mocha transition-colors hover:bg-blush"
          >
            ⋯
          </summary>
          <div className="absolute right-0 top-11 z-10 flex w-56 flex-col rounded-lg border border-line bg-surface py-1 shadow-card">
            <Link href={`${base}/book`} className="px-4 py-2.5 text-sm text-ink hover:bg-blush hover:text-wine">
              Book next session
            </Link>
            <Link href={`/practitioner/messages/${client.id}`} className="px-4 py-2.5 text-sm text-ink hover:bg-blush hover:text-wine">
              Open conversation
            </Link>
            <Link href={`${base}/design`} className="px-4 py-2.5 text-sm text-ink hover:bg-blush hover:text-wine">
              Chart &amp; integrative map
            </Link>
          </div>
        </details>
        {nextSession && schedConfig && (
          <span className="hidden text-[13px] text-whisper sm:inline">
            next · {formatInZone(nextSession.startAt, schedConfig.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Tabs — a wrapping chip grid: every section visible at once, one tap,
          no sideways dragging. The active chip is filled; the rest stay quiet. */}
      <div
        className="gentle-rise flex flex-wrap gap-1.5 border-b border-line pb-3"
        style={{ animationDelay: "340ms" }}
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-wine bg-wine text-white"
                : "border-line text-slate hover:border-mocha hover:text-wine"
            }`}
          >
            {t.label}
            {t.key === "messages" && unreadMessages > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[11px] font-semibold ${
                  tab === t.key ? "bg-white text-wine" : "bg-wine text-white"
                }`}
              >
                {unreadMessages}
              </span>
            )}
          </Link>
        ))}
      </div>

      <div className="gentle-rise" style={{ animationDelay: "400ms" }}>
        {tab === "record" && (
          <section className="flex flex-col gap-4 md:gap-6">
            {/* Theme + mood strip lives where it's used as a filter (§3). */}
            {rec.counts.total > 0 && (
              <div className="flex flex-col gap-3">
                <ThemeDots themes={rec.themes} clientId={client.id} />
                <MoodRiver trend={rec.moodTrend} />
              </div>
            )}
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
            {!clientConsent ? (
              <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
                <p className="max-w-prose text-ink">
                  {client.name || "This client"} doesn&apos;t have consent on file yet, so session
                  prep is off for them until they accept.
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
                <Row label="Consent" value={clientConsent ? "on file" : "not on file"} />
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

        {tab === "map" && <MapTab clientId={client.id} />}

        {tab === "margins" && (
          <MarginsTab clientId={client.id} clientName={client.name || client.email} tag={searchParams.noteTag} />
        )}

        {tab === "messages" && <MessagesShortcut clientId={client.id} />}

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

// C16 — The Map tab: the constellation. PRACTITIONER-ONLY (no client route
// renders this); every node's evidence opens the client's actual words.
async function MapTab({ clientId }: { clientId: string }) {
  const [graph, lastRun, notesSetting] = await Promise.all([
    loadGraph(clientId),
    prisma.psycheExtraction.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, referralFlag: true },
    }),
    prisma.practiceSetting.findUnique({ where: { key: NOTES_SOURCE_KEY } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {lastRun?.referralFlag && (
        <div className="rounded-card border-2 border-rose bg-white p-5 shadow-card">
          <p className="max-w-prose text-sm text-ink">
            The last reading met something heavy and stopped instead of mapping — please review
            their recent material directly and consider involving a licensed professional.
          </p>
        </div>
      )}
      <MapWorkbench
        clientId={clientId}
        nodes={graph.nodes}
        edges={graph.edges}
        lastRunAt={lastRun?.createdAt.toISOString() ?? null}
        notesEnabled={notesSetting?.value === "true"}
      />
      <p className="max-w-prose text-[13px] text-whisper">
        A working model of patterns — hypotheses with evidence, never a diagnosis. Larger bodies
        carry more evidence; warmth is recency; a gold ring means they named it themselves. A
        dashed outline is a chart hypothesis — the chart proposes; the record confirms.
      </p>
    </div>
  );
}

// AMENDMENT-04 §2c — the Portrait's Messages tab is a shortcut, not a second
// implementation: one hairline row deep-linking to the one thread.
async function MessagesShortcut({ clientId }: { clientId: string }) {
  const convo = await prisma.conversation.findUnique({
    where: { clientId },
    include: {
      messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: { messages: { where: { senderRole: "CLIENT", readAt: null, deletedAt: null } } },
      },
    },
  });
  const last = convo?.messages[0] ?? null;
  const unread = convo?._count.messages ?? 0;

  return (
    <Link
      href={`/practitioner/messages/${clientId}`}
      className="-mx-4 flex min-h-[52px] items-center gap-3 border-y border-line px-4 transition-colors hover:bg-blush/30 md:mx-0 md:rounded-lg md:border"
    >
      {unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-wine" aria-label="unread" />}
      <span className="min-w-0 flex-1 text-[15px] text-ink">
        Conversation
        <span className="text-whisper">
          {" "}
          · {last ? `last message ${relDay(last.createdAt)}` : "nothing yet — say hello"}
        </span>
      </span>
      <span className="text-lg text-mocha">›</span>
    </Link>
  );
}

// C13-PKG §8/§10 — the Portrait's money view: package standing, a new-invoice
// form (Square hosts payment + delivery), and the charge history with its
// kind/fee-reason words.
const CHARGE_FEE_LABEL: Record<string, string> = {
  LATE_RESCHEDULE: "late reschedule",
  LATE_CANCEL: "late cancellation",
  NO_SHOW: "no-show",
};

async function BillingTab({ clientId, back }: { clientId: string; back: string }) {
  const [charges, packages, priceBook, clientUser] = await Promise.all([
    prisma.charge.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    clientPackageSummary(clientId),
    prisma.priceBook.findMany({
      where: { active: true },
      orderBy: [{ kind: "desc" }, { createdAt: "desc" }], // packages first
    }),
    prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        profile: { select: { payeeName: true, payeeEmail: true } },
      },
    }),
  ]);
  // Link to Square automatically — everything they already have there
  // (billing address, cards on file, even a pre-app customer record found by
  // email) should simply appear, no button to press first.
  let link = await prisma.squareCustomerLink.findUnique({ where: { clientId } });
  if (!link && squareConfigured() && clientUser) {
    await ensureSquareCustomer(clientUser).catch(() => undefined);
    link = await prisma.squareCustomerLink.findUnique({ where: { clientId } });
  }
  // Live from Square — their processor profile and stored cards.
  const [squareProfile, cards, sq] = link
    ? await Promise.all([
        getSquareCustomer(link.squareCustomerId),
        listCardsOnFile(link.squareCustomerId),
        squarePublicConfig(),
      ])
    : [null, [] as Awaited<ReturnType<typeof listCardsOnFile>>, await squarePublicConfig()];
  const payee =
    clientUser?.profile?.payeeName && clientUser.profile.payeeEmail
      ? { name: clientUser.profile.payeeName, email: clientUser.profile.payeeEmail }
      : null;

  const monthYear = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);

  return (
    <div className="flex flex-col gap-6">
      {/* Packages */}
      {packages.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Packages</p>
          <div className="mt-3 flex flex-col gap-2">
            {packages.map((p) => (
              <p key={p.id} className="flex flex-wrap items-center gap-3 text-sm text-ink">
                <span className="font-medium text-ink-strong">
                  {p.sessionsTotal}-session package
                </span>
                <span className="text-slate">
                  {p.used} of {p.sessionsTotal} used
                  {p.reserved > 0 ? ` · ${p.reserved} reserved` : ""}
                  {p.expiresAt ? ` · through ${monthYear(p.expiresAt)}` : ""}
                </span>
                <span className="ml-auto text-xs font-medium text-mocha">
                  {p.status === "ACTIVE" ? "active" : "complete"}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Square billing profile & cards on file */}
      {squareConfigured() && (
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Billing profile (Square)</p>
          {!link ? (
            <form action={linkSquareCustomer.bind(null, clientId)} className="mt-3">
              <input type="hidden" name="back" value={back} />
              <p className="mb-3 max-w-prose text-sm text-ink">
                Square couldn&apos;t place this client just now — try the link again in a moment.
              </p>
              <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Link to Square
              </button>
            </form>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {squareProfile && (
                <div className="grid gap-x-6 gap-y-1 text-sm text-ink sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-ink-strong">
                      {[squareProfile.givenName, squareProfile.familyName].filter(Boolean).join(" ") || "—"}
                    </span>
                  </p>
                  <p>{squareProfile.email ?? <span className="text-slate">no email on file</span>}</p>
                  <p>{squareProfile.phone ?? <span className="text-slate">no phone on file</span>}</p>
                  <p>
                    {squareProfile.addressLine1 ? (
                      [
                        [squareProfile.addressLine1, squareProfile.addressLine2].filter(Boolean).join(", "),
                        [squareProfile.city, squareProfile.state, squareProfile.postalCode]
                          .filter(Boolean)
                          .join(", "),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    ) : (
                      <span className="text-slate">no billing address on file</span>
                    )}
                  </p>
                </div>
              )}
              <details className="rounded-md border border-line/70 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-wine">
                  Edit billing details
                </summary>
                <form
                  action={updateSquareProfile.bind(null, clientId)}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="back" value={back} />
                  {(
                    [
                      ["givenName", "First name", squareProfile?.givenName],
                      ["familyName", "Last name", squareProfile?.familyName],
                      ["email", "Email", squareProfile?.email],
                      ["phone", "Phone", squareProfile?.phone],
                      ["addressLine1", "Address", squareProfile?.addressLine1],
                      ["addressLine2", "Address line 2", squareProfile?.addressLine2],
                      ["city", "City", squareProfile?.city],
                      ["state", "State", squareProfile?.state],
                      ["postalCode", "ZIP", squareProfile?.postalCode],
                    ] as const
                  ).map(([name, label, value]) => (
                    <label key={name} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-strong">{label}</span>
                      <input
                        name={name}
                        defaultValue={value ?? ""}
                        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </label>
                  ))}
                  <button className="self-end justify-self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                    Save to Square
                  </button>
                </form>
              </details>

              <div>
                <p className="text-sm font-medium text-ink-strong">Cards on file</p>
                {cards.length === 0 ? (
                  <p className="mt-1 text-sm text-slate">None yet.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 text-sm text-ink">
                    {cards.map((c) => (
                      <li key={c.id}>
                        {c.brand} ····{c.last4} · exp {c.expMonth}/{c.expYear}
                      </li>
                    ))}
                  </ul>
                )}
                {sq && (
                  <details className="mt-3 rounded-md border border-line/70 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-wine">
                      Add a card on file
                    </summary>
                    <p className="mb-3 mt-2 max-w-prose text-xs text-slate">
                      With the client&apos;s consent. The card number goes straight into
                      Square&apos;s secure form — it never touches this app.
                    </p>
                    <SquareCardForm
                      applicationId={sq.applicationId}
                      locationId={sq.locationId}
                      scriptUrl={sq.scriptUrl}
              sandbox={sq.sandbox}
                      amountLabel=""
                      buttonLabel="Save card on file"
                      successMessage="Card saved."
                      payAction={saveCardOnFile.bind(null, clientId)}
                      successPath={`${back}&billing=cardsaved`}
                    />
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payee — someone else covers the bill */}
      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <p className="text-eyebrow font-semibold uppercase text-mocha">Payee</p>
        <p className="mt-2 max-w-prose text-sm text-slate">
          When someone else covers this client&apos;s bills — a parent, a partner, an employer —
          add them here. They&apos;ll receive every invoice and payment reminder by email, with
          the PDF invoice attached.
        </p>
        {payee && (
          <p className="mt-3 text-sm text-ink">
            <span className="font-medium text-ink-strong">{payee.name}</span> · {payee.email}
          </p>
        )}
        <form
          action={savePayee.bind(null, clientId)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="back" value={back} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-strong">Name</span>
            <input
              name="payeeName"
              defaultValue={payee?.name ?? ""}
              placeholder="Who pays"
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-strong">Email</span>
            <input
              name="payeeEmail"
              type="email"
              defaultValue={payee?.email ?? ""}
              placeholder="where invoices go"
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            {payee ? "Update payee" : "Save payee"}
          </button>
        </form>
        {payee && (
          <p className="mt-2 text-xs text-slate">
            To remove the payee, clear both fields and save.
          </p>
        )}
      </div>

      {/* New invoice */}
      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <p className="text-eyebrow font-semibold uppercase text-mocha">New invoice</p>
        {squareConfigured() ? (
          <form action={sendInvoice.bind(null, clientId)} className="mt-3 flex flex-col gap-4">
            <input type="hidden" name="back" value={back} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Line item</span>
              <select
                name="priceBookId"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="">Custom — describe it below</option>
                {priceBook.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {formatMoney(r.amountCents, r.currency)}
                    {r.kind === "PACKAGE" && r.sessionsIncluded
                      ? ` · ${r.sessionsIncluded} sessions`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  Description <span className="font-normal text-slate">(custom only)</span>
                </span>
                <input
                  type="text"
                  name="description"
                  placeholder="What this covers"
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  Amount <span className="font-normal text-slate">(custom only)</span>
                </span>
                <input
                  type="number"
                  name="amount"
                  min={1}
                  step="0.01"
                  className="w-28 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  Due <span className="font-normal text-slate">(optional)</span>
                </span>
                <input
                  type="date"
                  name="dueDate"
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">
                A note, in your voice <span className="font-normal text-slate">(optional)</span>
              </span>
              <input
                type="text"
                name="note"
                placeholder="It goes on the invoice itself"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
            <button className="self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
              Send invoice
            </button>
            <p className="text-xs text-slate">
              Your branded email carries it; Square hosts the payment page. It shows as paid here
              on its own.
            </p>
          </form>
        ) : (
          <p className="mt-3 max-w-prose text-sm text-ink">
            Square isn&apos;t connected yet — once it is, you can send invoices from here.
          </p>
        )}
      </div>

      {/* Charges */}
      {charges.length === 0 ? (
        <p className="text-ink">No charges yet — they appear as sessions are booked.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {charges.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-5 py-3 text-sm shadow-soft">
              <span className="font-medium text-ink-strong">{c.description}</span>
              <span className="text-ink">{formatMoney(c.amountCents, c.currency)}</span>
              {c.kind === "PACKAGE" && (
                <span className="rounded-full bg-blush-deep px-2 py-0.5 text-xs font-medium text-wine">
                  package
                </span>
              )}
              {c.kind === "LATE_FEE" && (
                <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                  {(c.feeReason && CHARGE_FEE_LABEL[c.feeReason]) ?? "fee"}
                </span>
              )}
              <span className="text-slate">
                {c.status === "PAID"
                  ? `paid${c.paidAt ? ` · ${c.paidAt.toISOString().slice(0, 10)}` : ""}`
                  : c.status === "DUE"
                    ? `awaiting${c.dueAt ? ` · due ${c.dueAt.toISOString().slice(0, 10)}` : ""}`
                    : c.status === "COVERED"
                      ? "covered by package"
                      : c.status.toLowerCase()}
              </span>
              {(c.status === "DUE" || c.status === "PENDING") && (
                <span className="ml-auto flex items-center gap-3">
                  {cards.length > 0 && c.status === "DUE" && (
                    <form
                      action={chargeCardOnFile.bind(null, c.id)}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="back" value={back} />
                      {cards.length === 1 ? (
                        <input type="hidden" name="cardId" value={cards[0].id} />
                      ) : (
                        <select
                          name="cardId"
                          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                        >
                          {cards.map((cd) => (
                            <option key={cd.id} value={cd.id}>
                              {cd.brand} ····{cd.last4}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="font-medium text-wine underline-offset-4 hover:underline">
                        {cards.length === 1 ? `Charge ····${cards[0].last4}` : "Charge card"}
                      </button>
                    </form>
                  )}
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
      )}
    </div>
  );
}
