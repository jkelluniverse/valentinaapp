import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getDiscoverySlots } from "@/lib/discovery";
import { SITE } from "@/content/site-content";
import { BookingFlow } from "./BookingFlow";
import { submitBooking } from "./actions";

// C18.3/.4 — the discovery funnel. Dynamic (reads live open slots) while the
// marketing home stays static. Reads ONLY free/busy times via the narrow
// lib/discovery surface — no client data crosses the wall.
export const dynamic = "force-dynamic";

// C31 — the description names HER, so it renders only where the request
// resolves her tenant (byte-identical for the default host). A non-default
// practice keeps the same page title COPY, untouched; the (public) layout's
// resolved template supplies that practice's name as the tab suffix. No
// description is invented for a practice (brand-web's to write).
export async function generateMetadata(): Promise<Metadata> {
  const { getTenantResolution } = await import("@/lib/tenancy");
  const { DEFAULT_TENANT_ID } = await import("@/lib/tenancy/scope");
  const r = await getTenantResolution();
  if (r.kind === "tenant" && r.tenant.id !== DEFAULT_TENANT_ID) {
    return { title: "Book a free discovery call" };
  }
  return {
    title: "Book a free discovery call",
    description:
      "Book a free, no-pressure discovery call with Valentina Vélez to see whether this work is the right fit.",
  };
}

export default async function BookPage({ searchParams }: { searchParams: { error?: string } }) {
  // C26 §3 — checked here as well as in the public layout: this page's slot
  // read races the layout's redirect, and rendering ANOTHER practice's
  // availability on this host is the exact defect task #81 reproduced.
  const { getTenantResolution } = await import("@/lib/tenancy");
  const resolution = await getTenantResolution();
  if (resolution.kind === "unresolved") {
    const { redirect } = await import("next/navigation");
    redirect("/unavailable");
  }
  const { days, timezone } = await getDiscoverySlots();
  // C29 — the empty-slots copy names the practice the visitor is actually
  // booking with. Passed only for non-default tenants; the default tenant's
  // page renders byte-identically (its copy is her page's own voice).
  const { DEFAULT_TENANT_ID } = await import("@/lib/tenancy/scope");
  const practiceName =
    resolution.kind !== "unresolved" && resolution.tenant.id !== DEFAULT_TENANT_ID
      ? resolution.tenant.displayName
      : undefined;

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:px-8">
      <Eyebrow>A free discovery call</Eyebrow>
      <h1 className="mt-2 font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        Let&apos;s find a time to talk
      </h1>
      <SignatureRule />
      <p className="mb-10 mt-4 max-w-lg text-lg leading-relaxed text-slate">{SITE.closing.body}</p>

      <BookingFlow days={days} timezone={timezone} action={submitBooking} error={searchParams.error} practiceName={practiceName} />
    </main>
  );
}
