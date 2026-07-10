import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { HdChartView } from "@/components/HdChartView";

export const dynamic = "force-dynamic";

// The client's profile + Human Design chart, as session context (C11 §7).
export default async function ClientDesignPage({
  params,
}: {
  params: { clientId: string };
}) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, profile: true, humanDesign: true },
  });
  if (!client) notFound();

  const p = client.profile;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Profile &amp; design</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
        <SignatureRule />
      </div>

      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold">Profile</h2>
        {p ? (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {p.preferredName && <Row label="Preferred name" value={p.preferredName} />}
            {p.pronouns && <Row label="Pronouns" value={p.pronouns} />}
            {p.phone && <Row label="Phone" value={p.phone} />}
            {p.birthDate && (
              <Row
                label="Born"
                value={`${p.birthDate.toISOString().slice(0, 10)}${
                  p.birthTimeUnknown ? " · time unknown" : p.birthTime ? ` · ${p.birthTime}` : ""
                }${p.birthPlace ? ` · ${p.birthPlace}` : ""}`}
              />
            )}
            <Row
              label="Intake"
              value={
                p.intakeCompletedAt
                  ? `completed ${p.intakeCompletedAt.toISOString().slice(0, 10)}`
                  : "not yet completed"
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-slate">
            Nothing here yet — they haven&apos;t filled in their profile.
          </p>
        )}
      </section>

      {client.humanDesign ? (
        <HdChartView chart={client.humanDesign} />
      ) : (
        <p className="rounded-lg border border-line bg-white p-6 text-ink shadow-soft">
          No chart yet — it generates automatically once they add their birth date, time, and
          place in their profile.
        </p>
      )}

      <Link
        href={`/practitioner/clients/${client.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the client record
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-semibold uppercase tracking-wide text-mocha">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
