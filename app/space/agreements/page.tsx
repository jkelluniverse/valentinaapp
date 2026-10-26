import Link from "next/link";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";

// C20 §4 — "Your agreements": the client's permanent shelf. It's their
// document too — every sealed copy downloadable, forever.

export const dynamic = "force-dynamic";

const STATUS_LINE: Record<string, string> = {
  SENT: "Waiting for you to read and sign",
  VIEWED: "Waiting for your signature",
  SIGNED: "Signed",
  DECLINED: "You chose not to sign",
  EXPIRED: "The link expired — ask for a fresh one",
  VOIDED: "Withdrawn",
  DRAFT: "Being prepared",
};

export default async function MyAgreements() {
  const user = await requireClient();
  const agreements = await prisma.agreement.findMany({
    where: { clientId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your agreements</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Signed, and kept</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Everything you&apos;ve been asked to sign, and every signed copy — yours to read and
          download, always.
        </p>
      </div>

      {agreements.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-sm text-slate shadow-card">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {agreements.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink-strong">{a.titleSnapshot}</span>
                <span className="text-[13px] text-slate">
                  {STATUS_LINE[a.status] ?? a.status}
                  {a.signedAt ? ` · ${a.signedAt.toISOString().slice(0, 10)}` : ""}
                </span>
              </div>
              {["SENT", "VIEWED"].includes(a.status) && (
                <Link
                  href={`/space/agreements/${a.id}`}
                  className="rounded-lg bg-wine px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
                >
                  Read &amp; sign
                </Link>
              )}
              {a.sealedKey && (
                <a
                  href={`/api/agreements/${a.id}/pdf`}
                  className="text-sm font-medium text-wine underline-offset-4 hover:underline"
                >
                  Download signed copy
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
