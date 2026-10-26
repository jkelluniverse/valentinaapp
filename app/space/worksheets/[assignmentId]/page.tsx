import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { WorksheetFill } from "@/components/WorksheetFill";
import { WorksheetAnswersView } from "@/components/WorksheetAnswers";
import { formatDay } from "@/components/entries";
import { parseFields, answerableFields, type WorksheetAnswers, type WorksheetField } from "@/lib/worksheet-meta";
import { submitWorksheet } from "../actions";

export const dynamic = "force-dynamic";

// AMD-05 A5 — locale-aware serving: same field ids by construction, so answers
// can only substitute DISPLAY text. Verified anyway (id/type parity) before
// swapping; falling back to the original is always safe.
function sameShape(a: WorksheetField[], b: WorksheetField[]) {
  const keys = (fs: WorksheetField[]) => answerableFields(fs).map((f) => `${f.id}:${f.type}`);
  const ka = keys(a);
  const kb = keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

// The client fill-out (C9 spec §6) — calm, sectioned, autosaving on-device.
export default async function WorksheetFillPage({
  params,
  searchParams,
}: {
  params: { assignmentId: string };
  searchParams: { error?: string; done?: string };
}) {
  const user = await requireClient();
  const t = await getTranslations("common");

  const assignment = await prisma.worksheetAssignment.findFirst({
    where: { id: params.assignmentId, clientId: user.id },
    include: { worksheet: true, response: true },
  });
  if (!assignment) notFound();

  // AMD-05 A5 — render the reader's language when an ACTIVE sibling exists;
  // answers always save against the ORIGINAL assignment/worksheet.
  const original = assignment.worksheet;
  let display = original;
  const userLocale = user.locale === "es" ? "es" : "en";
  if (original.locale !== userLocale) {
    const sibling = await prisma.worksheet.findFirst({
      where: {
        active: true,
        locale: userLocale,
        OR: [
          { translationOfId: original.id },
          ...(original.translationOfId
            ? [{ id: original.translationOfId }, { translationOfId: original.translationOfId }]
            : []),
        ],
      },
    });
    if (sibling && sameShape(parseFields(original.schema), parseFields(sibling.schema))) {
      display = sibling;
    }
  }

  const fields = parseFields(display.schema);
  const submit = submitWorksheet.bind(null, assignment.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("worksheet.eyebrow")}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{display.title}</h1>
        {display.intro && (
          <p className="max-w-prose text-lg leading-relaxed text-ink">{display.intro}</p>
        )}
        <SignatureRule />
        {assignment.dueAt && assignment.status === "PENDING" && (
          <p className="text-sm text-slate">
            {t("worksheet.due", { date: formatDay(assignment.dueAt) })}
          </p>
        )}
      </div>

      {searchParams.done && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {t("worksheet.done")}
        </p>
      )}

      {assignment.status === "PENDING" ? (
        <WorksheetFill
          assignmentId={assignment.id}
          fields={fields}
          action={submit}
          error={searchParams.error === "required" ? t("worksheet.requiredError") : null}
        />
      ) : assignment.response ? (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-xs text-slate">
            {t("worksheet.sent", { date: formatDay(assignment.response.completedAt) })}
          </p>
          <WorksheetAnswersView
            fields={fields}
            answers={assignment.response.answers as WorksheetAnswers}
          />
        </div>
      ) : (
        <p className="text-ink">{t("worksheet.setAside")}</p>
      )}

      <Link href="/space" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        {t("worksheet.back")}
      </Link>
    </div>
  );
}
