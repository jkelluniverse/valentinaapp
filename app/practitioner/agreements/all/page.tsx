import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { remindAgreement, voidAgreementAction, countersignAction, markPaperAction } from "../actions";
import { STATUS_TONE, SHELVES, StatusBar, signerLabel } from "../ui";

// C22.2 — the archive, documents-first like the Library: one tile per
// document, open it for that document's requests with status shelves.

export const dynamic = "force-dynamic";

export default async function AllAgreementsPage({
  searchParams,
}: {
  searchParams: { view?: string; show?: string; doc?: string };
}) {
  await requirePractitioner();
  const [agreements, clients] = await Promise.all([
    prisma.agreement.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true, name: true, email: true } }),
  ]);
  const nameFor = new Map(clients.map((c) => [c.id, c.name ?? c.email]));

  const view = searchParams.view === "list" ? "list" : "grid";
  const shelf = SHELVES.find((s) => s.key === searchParams.show) ?? SHELVES[0];
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
    return `/practitioner/agreements/all${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · all documents</Eyebrow>
        <h1 className="font-headline text-[1.8rem] font-medium text-ink-strong">All documents</h1>
        <SignatureRule />
      </div>

      {!doc ? (
        (() => {
          const tiles = [...groups.entries()].sort((a, b) => +b[1][0].createdAt - +a[1][0].createdAt);
          return tiles.length === 0 ? (
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
          );
        })()
      ) : (
        <div className="flex flex-col gap-3">
          <nav className="flex items-center gap-1 text-[15px]">
            <Link href={href({ doc: null, show: "all" })} className="rounded px-1 text-slate underline-offset-4 hover:text-wine hover:underline">
              All documents
            </Link>
            <span className="text-whisper">/</span>
            <span className="min-w-0 truncate font-semibold text-ink-strong">{doc}</span>
          </nav>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map((a) => (
                <div key={a.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-white p-4 shadow-soft">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink-strong">{signerLabel(a, nameFor)}</span>
                    <span className="text-[11px] text-whisper">{a.createdAt.toISOString().slice(0, 10)}</span>
                  </div>
                  <StatusBar a={a} />
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
              {shown.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="text-slate">
                      {a.clientId ? nameFor.get(a.clientId) ?? "—" : a.recipientName ? `${a.recipientName}${a.recipientEmail ? ` (${a.recipientEmail})` : ""}` : "lead"}
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
      )}

      <Link href="/practitioner/agreements" className="text-[13px] text-whisper hover:text-wine">
        ← back to agreements
      </Link>
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
