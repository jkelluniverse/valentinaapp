import { getTenant } from "@/lib/tenancy";

// PLATFORM §7 — DEMO tenants are banner-marked, always. Renders nothing
// for ACTIVE tenants (Valentina's portals byte-identical).

export async function DemoBanner() {
  const tenant = await getTenant();
  if (tenant.status !== "DEMO") return null;
  return (
    <div className="mb-6 rounded-md border border-dashed border-mocha bg-blush px-4 py-2 text-center text-[13px] font-medium text-wine">
      Demonstration space — everyone here is fictional.
    </div>
  );
}
