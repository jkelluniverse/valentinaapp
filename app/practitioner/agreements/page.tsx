import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import {
  seedStarterTemplates,
  installMasterV31Action,
  installDisputePacketAction,
  installPaymentAuthAction,
  sendAgreementAction,
  sendToEmailAction,
  createSignLinkAction,
  uploadRequestAction,
  selfSignAction,
  remindAgreement,
  voidAgreementAction,
  countersignAction,
  markPaperAction,
  toggleTemplateTrigger,
} from "./actions";
import { V31_SLUG } from "@/lib/agreements/install-v31";
import { DECLARATION_SLUG, PAYMENT_AUTH_SLUG, PAYMENT_AUTH_BODY } from "@/lib/agreements/install-c21";
import { CopyButton } from "@/components/agreements/CopyButton";

// C20 §2 — the practitioner's agreements desk: templates (versioned,
// placeholder-marked until the attorney pass), the send flow (manual),
// per-template automatic triggers, and the library-wide list with states.
// States: Draft → Sent → Viewed → Signed → (Declined / Expired / Voided);
// voiding is hers, attributed, never deletes history.

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  SIGNED: "bg-blush text-wine",
  SENT: "border border-line text-slate",
  VIEWED: "border border-mocha text-mocha",
  DECLINED: "border border-line text-slate line-through",
  EXPIRED: "border border-line text-whisper",
  VOIDED: "border border-line text-whisper line-through",
  DRAFT: "border border-line text-whisper",
};

const TRIGGERS: { field: string; label: string }[] = [
  { field: "sendOnInviteAccept", label: "on invite acceptance" },
  { field: "requireBeforeBooking", label: "require before booking" },
  { field: "sendOnPackagePurchase", label: "on package purchase" },
  { field: "sendOnRecordingConsent", label: "on recording consent" },
];

// C21 — the agreements browser filters, Library-style: a selectable view
// (grid tiles / detailed list) + status shelves instead of one long list.
const SHELVES: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "awaiting", label: "Awaiting signature", statuses: ["SENT", "VIEWED"] },
  { key: "signed", label: "Signed & sealed", statuses: ["SIGNED"] },
  { key: "closed", label: "Declined / expired / voided", statuses: ["DECLINED", "EXPIRED", "VOIDED"] },
];

export default async function AgreementsDesk({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; seeded?: string; view?: string; show?: string; doc?: string; signlink?: string; signee?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();

  const [templates, agreements, clients] = await Promise.all([
    prisma.agreementTemplate.findMany({ where: { tenantId: tenant.id, status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: [{ slug: "asc" }, { locale: "asc" }] }),
    prisma.agreement.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const nameFor = new Map(clients.map((c) => [c.id, c.name ?? c.email]));
  // en rows lead; es siblings route automatically by client locale — but an
  // es-ONLY document (no en sibling, e.g. the payment authorization) must
  // still show on the desk.
  const enSlugs = new Set(templates.filter((t) => t.locale === "en").map((t) => t.slug));
  const enTemplates = templates.filter((t) => t.locale === "en" || !enSlugs.has(t.slug));
  const sendableTemplates = enTemplates.filter((t) => t.status === "ACTIVE");
  const anyPlaceholder = templates.some((t) => t.placeholder);
  const v31Installed = templates.some((t) => t.slug === V31_SLUG);
  const packetInstalled = templates.some((t) => t.slug === DECLARATION_SLUG);
  const payAuthRow = templates.find((t) => t.slug === PAYMENT_AUTH_SLUG);
  const payAuthInstalled = Boolean(payAuthRow);
  const payAuthStale = Boolean(payAuthRow && payAuthRow.body !== PAYMENT_AUTH_BODY);
  const fileCounts = new Map<string, number>();
  for (const g of await prisma.agreementFile.groupBy({ by: ["templateId"], where: { templateId: { not: null } }, _count: true })) {
    if (g.templateId) fileCounts.set(g.templateId, g._count);
  }
  const storedSignature = await (await import("@/lib/agreements")).getPractitionerSignature();
  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Signed, and kept</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Send agreements, collect signatures, and keep the sealed record — for both of you.
        </p>
      </div>

      {anyPlaceholder && (
        <p className="rounded-md border border-dashed border-mocha bg-blush px-4 py-2.5 text-sm text-wine">
          These template texts are placeholders. Nothing real goes out before your attorney
          blesses the wording — the flag stands until then.
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>
      )}
      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — they&apos;ll get the email, and it waits in their space too.
        </p>
      )}

      {/* C21.3 — her signature, one hop from where she signs. */}
      <Link
        href="/practitioner/settings#signature"
        className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 text-[14px] shadow-soft transition-shadow hover:shadow-card"
      >
        <span className="font-medium text-ink-strong">Your signature</span>
        {storedSignature ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={storedSignature} alt="Stored signature" className="h-8 w-auto max-w-[140px] rounded border border-line bg-white object-contain px-1" />
            <span className="text-[12px] text-whisper">stored — signs and countersigns for you, auto-dated · change it →</span>
          </>
        ) : (
          <span className="rounded-full bg-blush px-2.5 py-0.5 text-[12px] font-medium text-wine">
            not set yet — draw or upload it once →
          </span>
        )}
      </Link>

      {!v31Installed && (
        <form action={installMasterV31Action}>
          <PendingButton className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Install master agreement v3.1 (counsel&apos;s draft — not sendable until released)
          </PendingButton>
        </form>
      )}
      {!packetInstalled && (
        <form action={installDisputePacketAction}>
          <PendingButton className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Install the dispute packet (declaration, memorandum, recording log, Square narrative)
          </PendingButton>
        </form>
      )}
      {!payAuthInstalled && (
        <form action={installPaymentAuthAction}>
          <PendingButton className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Install the payment authorization (es — signed by the payer via sign link)
          </PendingButton>
        </form>
      )}
      {payAuthStale && (
        <form action={installPaymentAuthAction}>
          <PendingButton className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Update the payment authorization to the new text (card fields removed)
          </PendingButton>
        </form>
      )}
      {searchParams.error === undefined && v31Installed && templates.find((t) => t.slug === V31_SLUG)?.status === "DRAFT" && (
        <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-slate">
          Master agreement v3.1 is installed as a DRAFT — preview works, sending is refused until
          it&apos;s released (counsel items outstanding).
        </p>
      )}

      {templates.length === 0 ? (
        <form action={seedStarterTemplates}>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Add the starter set (placeholders)
          </PendingButton>
        </form>
      ) : (
        <>
          <form method="get" action="/practitioner/agreements/preview" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="w-full text-[13px] font-semibold uppercase tracking-wide text-mocha">Send an agreement</p>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Template
              <select name="templateId" required className={fieldCls}>
                <option value="">Choose…</option>
                {sendableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (v{t.versionLabel ?? t.version})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Client
              <select name="clientId" required className={fieldCls}>
                <option value="">Choose…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Package (merge)
              <input name="package_name" className={fieldCls} placeholder="optional" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Price
              <input name="price" className={`${fieldCls} w-28`} placeholder="$—" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Term
              <input name="term" className={`${fieldCls} w-28`} placeholder="12 weeks" />
            </label>
            <button className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              Preview merged →
            </button>
          </form>

          <form action={sendToEmailAction} className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="w-full text-[13px] font-semibold uppercase tracking-wide text-mocha">
              Send to anyone by email
              <span className="ml-2 font-normal normal-case tracking-normal text-whisper">
                — no account needed; they read, fill, and sign from a secure link
              </span>
            </p>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Template
              <select name="templateId" required className={fieldCls}>
                <option value="">Choose…</option>
                {sendableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Recipient name
              <input name="recipientName" required className={fieldCls} placeholder="Full name" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Recipient email
              <input name="recipientEmail" type="email" required className={fieldCls} placeholder="name@example.com" />
            </label>
            <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              Send for signature
            </PendingButton>
          </form>

          <form id="signlink" action={createSignLinkAction} className="flex scroll-mt-24 flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="w-full text-[13px] font-semibold uppercase tracking-wide text-mocha">
              Create a sign link
              <span className="ml-2 font-normal normal-case tracking-normal text-whisper">
                — no email needed; copy the link and pass it along (e.g. your client forwards it to their payer)
              </span>
            </p>
            {searchParams.signlink && (
              <div className="flex w-full flex-col gap-2 rounded-card border border-wine bg-blush/30 p-4">
                <p className="text-sm font-medium text-wine">
                  Link ready for {searchParams.signee ?? "the signer"} — send it any way you like. It works for 30
                  days; the signed result lands below, and they get their sealed copy on the signing page.
                </p>
                <div className="flex w-full items-center gap-2">
                  <input
                    readOnly
                    value={searchParams.signlink}
                    className="min-w-0 flex-1 select-all rounded-md border border-line bg-white px-3 py-2 font-mono text-[12.5px] text-ink"
                  />
                  <CopyButton value={searchParams.signlink} />
                </div>
              </div>
            )}
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Document
              <select name="templateId" required className={fieldCls}>
                <option value="">Choose…</option>
                {sendableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Signer&apos;s name
              <input name="signerName" required className={fieldCls} placeholder="Who will sign" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Their email (optional)
              <input name="signerEmail" type="email" className={fieldCls} placeholder="for their sealed copy" />
            </label>
            <PendingButton className="rounded-lg border border-wine px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush/30">
              Create the link
            </PendingButton>
          </form>

          <form action={uploadRequestAction} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Upload a document for signing</p>
            <p className="max-w-prose text-[13px] leading-relaxed text-slate">
              Upload a Word document (.docx) and it becomes a fillable signing page — blank lines like{" "}
              <code className="rounded bg-white px-1 font-mono text-[12px]">______</code> turn into fields automatically (you can also
              write <code className="rounded bg-white px-1 font-mono text-[12px]">[[text: Full legal name]]</code>). A PDF attaches
              as-is for review and signature. <strong className="text-ink">Nothing saves or sends yet</strong> — next you&apos;ll see the
              document exactly as your signer will, with every field shown in place, and release it from there.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
                Document title
                <input name="title" required className={fieldCls} placeholder="e.g. Vendor NDA" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
                File(s)
                <input name="files" type="file" multiple required accept=".pdf,.docx,.png,.jpg,.jpeg" className="text-sm" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-[13px] text-slate">
                <input type="checkbox" name="requiresCountersign" className="h-4 w-4 rounded border-line text-wine" />
                I countersign after they sign
              </label>
              <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
                Preview it →
              </PendingButton>
            </div>
          </form>

          <div className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Templates &amp; automatic sending</h2>
            {enTemplates.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3">
                <span className="font-medium text-ink-strong">{t.title}</span>
                <span className="text-[12px] text-whisper">
                  v{t.versionLabel ?? t.version}
                  {t.kind === "FILES" ? ` · ${fileCounts.get(t.id) ?? 0} file${(fileCounts.get(t.id) ?? 0) === 1 ? "" : "s"}` : ""}
                  {t.placeholder ? " · placeholder" : ""}
                  {t.status === "DRAFT" ? " · DRAFT — not sendable" : ""}
                </span>
                {t.kind === "FILES" && t.status === "ACTIVE" && !t.requiresCountersign && (
                  <form action={selfSignAction.bind(null, t.id)}>
                    <PendingButton className="rounded-md border border-wine px-2.5 py-0.5 text-[12px] font-medium text-wine hover:bg-blush/30">
                      Sign &amp; seal myself
                    </PendingButton>
                  </form>
                )}
                {t.status === "DRAFT" && (
                  <Link
                    href={`/practitioner/agreements/preview?templateId=${t.id}&clientId=${clients[0]?.id ?? ""}`}
                    className="text-[12px] font-medium text-wine underline-offset-4 hover:underline"
                  >
                    Preview
                  </Link>
                )}
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {TRIGGERS.map((tr) => {
                    const on = (t as unknown as Record<string, boolean>)[tr.field];
                    return (
                      <form key={tr.field} action={toggleTemplateTrigger.bind(null, t.id, tr.field)}>
                        <PendingButton
                          className={`rounded-full px-2.5 py-0.5 text-[12px] ${on ? "bg-wine text-white" : "border border-line text-slate hover:border-mocha"}`}
                        >
                          {tr.label}
                        </PendingButton>
                      </form>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Signed &amp; sent</h2>

        {(() => {
          const view = searchParams.view === "list" ? "list" : "grid";
          const shelf = SHELVES.find((s) => s.key === searchParams.show) ?? SHELVES[0];
          // C21.2 — documents first, like the Library: each distinct
          // document is a tile; open one to see its requests. The flat
          // firehose list is gone.
          const groups = new Map<string, typeof agreements>();
          for (const a of agreements) {
            const g = groups.get(a.titleSnapshot);
            if (g) g.push(a);
            else groups.set(a.titleSnapshot, [a]);
          }
          const doc = searchParams.doc && groups.has(searchParams.doc) ? searchParams.doc : null;
          const docAgreements = doc ? groups.get(doc)! : agreements;
          const countFor = (s: (typeof SHELVES)[number]) =>
            s.statuses ? docAgreements.filter((a) => s.statuses!.includes(a.status)).length : docAgreements.length;
          const shown = shelf.statuses ? docAgreements.filter((a) => shelf.statuses!.includes(a.status)) : docAgreements;
          const href = (over: { view?: string; show?: string; doc?: string | null }) => {
            const p = new URLSearchParams();
            const v = over.view ?? view;
            const sh = over.show ?? shelf.key;
            const d = over.doc === undefined ? doc : over.doc;
            if (v !== "grid") p.set("view", v);
            if (sh !== "all") p.set("show", sh);
            if (d) p.set("doc", d);
            const qs = p.toString();
            return `/practitioner/agreements${qs ? `?${qs}` : ""}#browser`;
          };
          const signerOf = (a: (typeof agreements)[number]) =>
            a.clientId ? nameFor.get(a.clientId) ?? "—" : a.recipientName ? a.recipientName : "lead";

          // ---- Level 1: one tile per document ----
          if (!doc) {
            const tiles = [...groups.entries()].sort((a, b) => +b[1][0].createdAt - +a[1][0].createdAt);
            return (
              <div id="browser" className="flex flex-col gap-3">
                {tiles.length === 0 ? (
                  <p className="rounded-card border border-dashed border-line bg-white/60 px-5 py-10 text-center text-slate">
                    Nothing sent yet — the first document will appear here.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {tiles.map(([title, rows]) => {
                      const awaiting = rows.filter((a) => ["SENT", "VIEWED"].includes(a.status)).length;
                      const sealedN = rows.filter((a) => a.sealedSha256).length;
                      const needsCounter = rows.filter((a) => a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt).length;
                      return (
                        <Link
                          key={title}
                          href={href({ doc: title })}
                          className="flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-white p-4 shadow-soft transition-shadow hover:shadow-card"
                        >
                          <span className="flex items-start gap-2">
                            <DocGlyph />
                            <span className="line-clamp-2 font-medium leading-snug text-ink-strong">{title}</span>
                          </span>
                          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[12px]">
                            <span className="text-whisper">
                              {rows.length} request{rows.length === 1 ? "" : "s"}
                            </span>
                            {awaiting > 0 && <span className="rounded-full border border-mocha px-2 py-0.5 text-mocha">{awaiting} awaiting</span>}
                            {needsCounter > 0 && <span className="rounded-full bg-wine px-2 py-0.5 text-white">countersign</span>}
                            {sealedN > 0 && <span className="rounded-full bg-blush px-2 py-0.5 text-wine">{sealedN} sealed</span>}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // ---- Level 2: one document's requests ----
          return (
            <div id="browser" className="flex flex-col gap-3">
              <nav className="flex items-center gap-1 text-[15px]">
                <Link href={href({ doc: null, show: "all" })} className="rounded px-1 text-slate underline-offset-4 hover:text-wine hover:underline">
                  All documents
                </Link>
                <span className="text-whisper">/</span>
                <span className="min-w-0 truncate font-semibold text-ink-strong">{doc}</span>
              </nav>
              {/* Toolbar — shelves + the selectable view, Library-style. */}
              <div className="flex flex-wrap items-center gap-2">
                {SHELVES.map((s) => (
                  <Link
                    key={s.key}
                    href={href({ show: s.key })}
                    className={`rounded-full px-3 py-1 text-[13px] ${
                      s.key === shelf.key ? "bg-wine text-white" : "border border-line text-slate hover:border-mocha hover:text-wine"
                    }`}
                  >
                    {s.label} · {countFor(s)}
                  </Link>
                ))}
                <div className="ml-auto flex overflow-hidden rounded-md border border-line">
                  <Link
                    href={href({ view: "grid" })}
                    aria-pressed={view === "grid"}
                    className={`px-3 py-1.5 text-sm ${view === "grid" ? "bg-blush text-wine" : "text-slate hover:text-wine"}`}
                  >
                    Grid
                  </Link>
                  <Link
                    href={href({ view: "list" })}
                    aria-pressed={view === "list"}
                    className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-blush text-wine" : "text-slate hover:text-wine"}`}
                  >
                    List
                  </Link>
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="rounded-card border border-dashed border-line bg-white/60 px-5 py-10 text-center text-slate">
                  Nothing on this shelf right now.
                </p>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {shown.map((a) => (
                    <div key={a.id} className="flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-white p-4 shadow-soft transition-shadow hover:shadow-card">
                      <span className="line-clamp-2 font-medium leading-snug text-ink-strong">{a.titleSnapshot}</span>
                      <span className="truncate text-[13px] text-slate">{signerOf(a)}</span>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[a.status] ?? ""}`}>
                          {a.status.toLowerCase()}
                        </span>
                        {a.sealedSha256 && <span className="text-[11px] text-whisper">sealed</span>}
                        <span className="ml-auto text-[11px] text-whisper">{a.createdAt.toISOString().slice(0, 10)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {["SENT", "VIEWED"].includes(a.status) && (
                          <form action={remindAgreement.bind(null, a.id)}>
                            <PendingButton className="rounded-md border border-line px-2.5 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                              Remind
                            </PendingButton>
                          </form>
                        )}
                        {a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt && (
                          <form action={countersignAction.bind(null, a.id)}>
                            <PendingButton className="rounded-md bg-wine px-2.5 py-1 text-[12px] font-medium text-white hover:bg-wine-dark">
                              Countersign
                            </PendingButton>
                          </form>
                        )}
                        {a.sealedKey && (
                          <Link href={`/api/agreements/${a.id}/pdf`} className="text-[12px] font-medium text-wine underline-offset-4 hover:underline">
                            Sealed PDF
                          </Link>
                        )}
                        {(["SENT", "VIEWED"].includes(a.status) || (a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt)) && (
                          <Link href={href({ view: "list" })} className="ml-auto text-[12px] text-whisper hover:text-wine">
                            more…
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
                  {shown.map((a) => (
                    <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-[14px]">
                        <span className="font-medium text-ink-strong">{a.titleSnapshot}</span>
                        <span className="text-slate">
                          · {a.clientId ? nameFor.get(a.clientId) ?? "—" : a.recipientName ? `${a.recipientName} (${a.recipientEmail})` : "lead"}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[a.status] ?? ""}`}>
                          {a.status.toLowerCase()}
                        </span>
                        {a.sealedSha256 && <span className="text-[12px] text-whisper">sealed</span>}
                        <span className="ml-auto text-[12px] text-whisper">{a.createdAt.toISOString().slice(0, 10)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {["SENT", "VIEWED"].includes(a.status) && (
                          <>
                            <form action={remindAgreement.bind(null, a.id)}>
                              <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                                Remind
                              </PendingButton>
                            </form>
                            <form action={markPaperAction.bind(null, a.id)} className="flex items-center gap-1.5">
                              <input name="note" placeholder="signed on paper by…" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                              <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                                Mark signed on paper
                              </PendingButton>
                            </form>
                          </>
                        )}
                        {a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt && (
                          <form action={countersignAction.bind(null, a.id)} className="flex items-center gap-1.5">
                            <input name="name" placeholder="your legal name" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                            <PendingButton className="rounded-md bg-wine px-3 py-1 text-[12px] font-medium text-white hover:bg-wine-dark">
                              Countersign
                            </PendingButton>
                          </form>
                        )}
                        {a.sealedKey && (
                          <Link href={`/api/agreements/${a.id}/pdf`} className="text-[12px] font-medium text-wine underline-offset-4 hover:underline">
                            Download sealed PDF
                          </Link>
                        )}
                        {!["VOIDED", "DECLINED"].includes(a.status) && (
                          <form action={voidAgreementAction.bind(null, a.id)} className="ml-auto flex items-center gap-1.5">
                            <input name="reason" placeholder="reason" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                            <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                              Void
                            </PendingButton>
                          </form>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DocGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-mocha" aria-hidden>
      <path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" fill="currentColor" opacity="0.18" />
      <path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 3.5v4h4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
