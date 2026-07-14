import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getDiscoveryManage } from "@/lib/discovery";
import { ManageFlow } from "./ManageFlow";
import { rescheduleAction, cancelAction } from "./actions";

// C18 §4.5 — the public reschedule/cancel page. No login: a signed token in the
// confirmation email authenticates the prospect. Reads only their own booking.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your discovery call",
  robots: { index: false, follow: false },
};

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { moved?: string; cancelled?: string; error?: string };
}) {
  const view = await getDiscoveryManage(params.token);

  if (!view) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-5 py-24 text-center md:px-8">
        <Eyebrow>Discovery call</Eyebrow>
        <h1 className="font-headline text-3xl font-semibold text-ink-strong">This link isn&apos;t valid</h1>
        <SignatureRule />
        <p className="text-slate">It may have expired or already been used. You&apos;re welcome to book a new call.</p>
        <Link href="/book" className="rounded-pill bg-wine px-6 py-2.5 text-sm font-medium text-white hover:bg-wine-dark">
          Book a call
        </Link>
      </main>
    );
  }

  const cancelled = view.status === "CANCELLED" || searchParams.cancelled === "1";

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:px-8">
      <Eyebrow>Your discovery call</Eyebrow>
      <h1 className="mt-2 font-headline text-[2rem] font-semibold leading-tight text-ink-strong md:text-4xl">
        Hi {view.name}
      </h1>
      <SignatureRule />

      {searchParams.moved === "1" && (
        <p className="mb-6 mt-4 rounded-md bg-blush px-4 py-2.5 text-sm text-wine">
          Your call has been moved — a new confirmation is on its way.
        </p>
      )}
      {searchParams.error && (
        <p className="mb-6 mt-4 rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That didn&apos;t work — please pick another time.
        </p>
      )}

      {cancelled ? (
        <div className="mt-4 flex flex-col items-start gap-5">
          <p className="text-lg text-slate">Your call has been cancelled. You&apos;re welcome anytime.</p>
          <Link href="/book" className="rounded-pill bg-wine px-6 py-2.5 text-sm font-medium text-white hover:bg-wine-dark">
            Book a new call
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-8 mt-4 text-lg text-ink">
            Your free discovery call is set for{" "}
            <span className="font-medium text-ink-strong">{view.whenLabel}</span>.
          </p>
          <ManageFlow
            days={view.days}
            timezone={view.timezone}
            rescheduleAction={rescheduleAction.bind(null, params.token)}
            cancelAction={cancelAction.bind(null, params.token)}
          />
        </>
      )}
    </main>
  );
}
