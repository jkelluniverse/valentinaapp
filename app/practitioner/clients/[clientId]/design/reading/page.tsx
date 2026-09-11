import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { Eyebrow, SignatureRule } from "@/components/brand";
import { ReadingProse } from "@/components/ReadingProse";
import { PendingButton } from "@/components/PendingButton";
import { displayName } from "@/lib/name";
import { sendReadingToClient } from "../actions";

export const dynamic = "force-dynamic";

// The reading, full-page — where she reads it whole, sends it to the client
// with one tap, or takes it away as the polished PDF report.
export default async function ReadingFullPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { saved?: string; error?: string };
}) {
  await requirePractitioner();
  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, locale: true },
  });
  if (!client) notFound();
  const reading = await prisma.integrativeReading.findUnique({ where: { userId: client.id } });

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Their reading · full page</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{displayName(client)}</h1>
        <SignatureRule />
      </div>

      {searchParams.saved === "sent" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — they&apos;ve been told their reading is ready.
        </p>
      )}
      {searchParams.saved === "sent-noemail" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Published for them — the email didn&apos;t go out in this environment (allowlist), but
          their reading is live in their space.
        </p>
      )}
      {searchParams.error === "send" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          The email couldn&apos;t be sent just now — their reading is published; try sending again
          in a moment.
        </p>
      )}
      {searchParams.error === "noreading" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          No reading to send yet.
        </p>
      )}

      {reading ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-4 shadow-soft">
            <form action={sendReadingToClient.bind(null, client.id)}>
              <PendingButton
                className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                pendingLabel="Sending…"
              >
                Send to client
              </PendingButton>
            </form>
            <a
              href={`/api/reading/${client.id}/pdf`}
              className="rounded-md border border-mocha px-4 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
            >
              Download PDF
            </a>
            <div className="ml-auto flex flex-col text-right text-xs text-slate">
              <span>
                {reading.status === "PENDING_REVIEW"
                  ? "Awaiting your approval — sending publishes it"
                  : "Live for the client"}
                {" · "}
                {reading.generatedAt.toISOString().slice(0, 10)}
                {reading.editedByPractitioner ? " · edited by you" : ""}
              </span>
              {reading.clientNotifiedAt && (
                <span>last sent {reading.clientNotifiedAt.toISOString().slice(0, 10)}</span>
              )}
            </div>
          </div>

          <article className="rounded-lg border border-line bg-white p-8 shadow-soft sm:p-10">
            <header className="mb-6 flex flex-col gap-1 border-b border-line pb-5">
              <p className="font-headline text-sm italic text-mocha">
                {client.locale === "es"
                  ? "Veritas · una lectura de tu diseño"
                  : "Veritas · a reading of your design"}
              </p>
              <p className="font-headline text-[1.75rem] font-medium text-wine">
                {client.locale === "es"
                  ? "Lo que todo esto significa para ti"
                  : "What it all means to you"}
              </p>
            </header>
            <ReadingProse content={reading.content} />
          </article>
        </>
      ) : (
        <p className="rounded-lg border border-line bg-white p-6 text-ink shadow-soft">
          No reading yet — generate it from the design page first.
        </p>
      )}

      <Link
        href={`/practitioner/clients/${client.id}/design`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        ← Back to profile &amp; design
      </Link>
    </div>
  );
}
