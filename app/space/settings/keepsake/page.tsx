import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { parseFields, type WorksheetAnswers } from "@/lib/worksheet-meta";
import { WorksheetAnswersView } from "@/components/WorksheetAnswers";
import { PrintButton } from "@/app/space/design/reading/PrintButton";

export const dynamic = "force-dynamic";

// AMD-05 B3 — the warm half of "download my data": a print-styled keepsake of
// the client's own words (reflections + worksheet answers), chronological,
// branded like the reading. JSON is the complete copy; this is the readable one.
export default async function KeepsakePage() {
  const user = await requireClient();
  const t = await getTranslations("settings");

  const [profile, entries, promptResponses, worksheetResponses] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: { preferredName: true },
    }),
    prisma.logEntry.findMany({ where: { clientId: user.id }, orderBy: { occurredAt: "asc" } }),
    prisma.promptResponse.findMany({
      where: { assignment: { clientId: user.id }, body: { not: null } },
      include: { assignment: { include: { prompt: { select: { title: true } } } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.worksheetResponse.findMany({
      where: { assignment: { clientId: user.id } },
      include: {
        assignment: { include: { worksheet: { select: { title: true, schema: true } } } },
      },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  const name = profile?.preferredName || user.name || user.email;
  const locale = user.locale === "es" ? "es" : "en";
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

  // One chronological stream of their written moments.
  const moments = [
    ...entries.map((e) => ({
      at: e.occurredAt,
      title: null as string | null,
      body: e.body,
    })),
    ...promptResponses.map((r) => ({
      at: r.completedAt,
      title: r.assignment.prompt.title,
      body: r.body ?? "",
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const empty = moments.length === 0 && worksheetResponses.length === 0;

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/space/settings"
          className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
        >
          ← {t("keepsake.back")}
        </Link>
        <PrintButton />
      </div>

      <header className="flex flex-col gap-1">
        <p className="font-headline text-sm italic text-mocha">{t("keepsake.eyebrow")}</p>
        <h1 className="font-headline text-[2.25rem] font-medium text-wine">
          {t("keepsake.title", { name })}
        </h1>
        <p className="mt-2 max-w-prose text-ink">{t("keepsake.intro")}</p>
      </header>

      {empty && <p className="text-slate">{t("keepsake.empty")}</p>}

      {moments.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-headline text-2xl font-medium text-wine">
            {t("keepsake.reflections")}
          </h2>
          {moments.map((m, i) => (
            <article key={i} className="flex flex-col gap-1 border-t border-line pt-4">
              <p className="text-sm text-mocha">
                {dateFmt.format(m.at)}
                {m.title ? ` · ${m.title}` : ""}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-ink">{m.body}</p>
            </article>
          ))}
        </section>
      )}

      {worksheetResponses.length > 0 && (
        <section className="flex flex-col gap-8">
          <h2 className="font-headline text-2xl font-medium text-wine">
            {t("keepsake.worksheets")}
          </h2>
          {worksheetResponses.map((r) => (
            <article key={r.id} className="flex flex-col gap-3 border-t border-line pt-4">
              <p className="text-sm text-mocha">
                {dateFmt.format(r.completedAt)} · {r.assignment.worksheet.title}
              </p>
              <WorksheetAnswersView
                fields={parseFields(r.assignment.worksheet.schema)}
                answers={(r.answers ?? {}) as WorksheetAnswers}
              />
            </article>
          ))}
        </section>
      )}

      <p className="border-t border-line pt-4 text-[13px] text-whisper">
        {t("keepsake.footer", { date: dateFmt.format(new Date()) })}
      </p>
    </div>
  );
}
