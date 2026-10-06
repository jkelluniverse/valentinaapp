import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { remindAgreement, countersignAction } from "./actions";
import { V31_SLUG } from "@/lib/agreements/install-v31";
import { DECLARATION_SLUG, PAYMENT_AUTH_SLUG, PAYMENT_AUTH_BODY } from "@/lib/agreements/install-c21";
import { StatusBar, signerLabel } from "./ui";

// C22.2 — the agreements desk, action-first: one question up top ("what
// would you like to do?"), four doors, and the documents in motion with
// their journey bars. Everything heavier lives one click away.

export const dynamic = "force-dynamic";

const ACTIONS: { href: string; glyph: string; title: string; hint: string }[] = [
  { href: "/practitioner/agreements/send", glyph: "✉️", title: "Send a document", hint: "To a client, or anyone by email" },
  { href: "/practitioner/agreements/link", glyph: "🔗", title: "Create a sign link", hint: "No email — copy it, pass it along" },
  { href: "/practitioner/agreements/upload", glyph: "⬆️", title: "Upload a document", hint: "Word or PDF becomes signable" },
  { href: "/practitioner/agreements/templates", glyph: "🗂️", title: "Manage documents", hint: "Your library, triggers, installs" },
];

export default async function AgreementsDesk({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; uploaded?: string; selfsigned?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();

  const [agreements, clients, templates, storedSignature] = await Promise.all([
    prisma.agreement.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true, name: true, email: true } }),
    prisma.agreementTemplate.findMany({ where: { tenantId: tenant.id }, select: { slug: true, body: true, status: true } }),
    (await import("@/lib/agreements")).getPractitionerSignature(),
  ]);
  const nameFor = new Map(clients.map((c) => [c.id, c.name ?? c.email]));
  const needsCounter = agreements.filter((a) => a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt);
  const payAuth = templates.find((t) => t.slug === PAYMENT_AUTH_SLUG);
  const updatesPending =
    !templates.some((t) => t.slug === V31_SLUG) ||
    !templates.some((t) => t.slug === DECLARATION_SLUG) ||
    !payAuth ||
    payAuth.body !== PAYMENT_AUTH_BODY;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Signed, and kept</h1>
        <SignatureRule />
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>
      )}
      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — they&apos;ll get it, and its journey shows below.
        </p>
      )}
      {searchParams.uploaded === "saved" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved to your documents — send it whenever you like.</p>
      )}
      {searchParams.selfsigned && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Signed &amp; sealed — the PDF is below.</p>
      )}

      {/* The four doors. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex flex-col gap-2 rounded-card border border-line bg-white p-5 shadow-soft transition-shadow hover:shadow-card"
          >
            <span className="text-[26px] leading-none" aria-hidden>
              {a.glyph}
            </span>
            <span className="font-headline text-[16px] font-semibold text-ink-strong group-hover:text-wine">
              {a.title}
              {a.href.endsWith("/templates") && updatesPending && (
                <span className="ml-2 inline-block rounded-full bg-wine px-2 py-0.5 align-middle text-[10px] font-medium text-white">
                  update
                </span>
              )}
            </span>
            <span className="text-[12.5px] leading-snug text-slate">{a.hint}</span>
          </Link>
        ))}
      </div>

      {/* Her signature, one quiet line. */}
      <Link
        href="/practitioner/settings#signature"
        className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-2.5 text-[13px] shadow-soft transition-shadow hover:shadow-card"
      >
        <span className="font-medium text-ink-strong">Your signature</span>
        {storedSignature ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={storedSignature} alt="Stored signature" className="h-7 w-auto max-w-[120px] rounded border border-line bg-white object-contain px-1" />
            <span className="text-whisper">signs and countersigns for you, auto-dated · change it →</span>
          </>
        ) : (
          <span className="rounded-full bg-blush px-2.5 py-0.5 text-[12px] font-medium text-wine">not set yet — draw or upload it once →</span>
        )}
      </Link>

      {/* Needs her hand first. */}
      {needsCounter.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card border border-wine bg-blush/30 p-4">
          <p className="text-sm font-semibold text-wine">Waiting on your countersign</p>
          {needsCounter.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink-strong">
                {a.titleSnapshot} <span className="font-normal text-slate">· {signerLabel(a, nameFor)}</span>
              </span>
              <form action={countersignAction.bind(null, a.id)}>
                <PendingButton className="rounded-lg bg-wine px-4 py-1.5 text-[13px] font-medium text-white hover:bg-wine-dark">
                  Countersign now
                </PendingButton>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* In motion — each document's journey at a glance. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">In motion</h2>
          <Link href="/practitioner/agreements/all" className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">
            All documents →
          </Link>
        </div>
        {agreements.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-white/60 px-5 py-10 text-center text-slate">
            Nothing sent yet — pick a door above to begin.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {agreements.map((a) => (
              <div key={a.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-white px-4 py-3.5 shadow-soft sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 sm:w-[42%]">
                  <p className="truncate text-[14.5px] font-medium text-ink-strong">{a.titleSnapshot}</p>
                  <p className="truncate text-[12.5px] text-slate">
                    {signerLabel(a, nameFor)} · {a.createdAt.toISOString().slice(0, 10)}
                  </p>
                </div>
                <div className="flex-1">
                  <StatusBar a={a} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {["SENT", "VIEWED"].includes(a.status) && (
                    <form action={remindAgreement.bind(null, a.id)}>
                      <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                        Remind
                      </PendingButton>
                    </form>
                  )}
                  {a.sealedKey && (
                    <Link href={`/api/agreements/${a.id}/pdf`} className="rounded-md border border-wine px-3 py-1 text-[12px] font-medium text-wine hover:bg-blush/30">
                      PDF
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
