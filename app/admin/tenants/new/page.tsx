import { notFound, redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { provisionTenant, type TenantConfigFile } from "@/lib/provisioning";
import { MODULES } from "@/lib/modules/registry";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";

// PLATFORM §7 — the admin provisioning flow. Jacob-only: gated on the
// PLATFORM_ADMIN_EMAILS env allowlist (no ADMIN role exists in the schema;
// the env list is the explicit, auditable substitute). Everyone else gets
// a 404 — the page effectively doesn't exist. Same service as the CLI:
// the form builds the SAME config object the JSON file carries.

export const dynamic = "force-dynamic";

function isAdmin(email: string): boolean {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: { error?: string; done?: string; email?: string; pw?: string };
}) {
  const user = await requirePractitioner();
  if (!isAdmin(user.email)) notFound();

  async function provision(formData: FormData) {
    "use server";
    const { requirePractitioner: guard } = await import("@/lib/auth-guards");
    const me = await guard();
    if (!isAdmin(me.email)) notFound();
    const cfg: TenantConfigFile = {
      slug: String(formData.get("slug") ?? "").trim(),
      displayName: String(formData.get("displayName") ?? "").trim(),
      layoutKey: (String(formData.get("layoutKey")) as TenantConfigFile["layoutKey"]) || "dashboard-v1",
      skinKey: (String(formData.get("skinKey")) as TenantConfigFile["skinKey"]) || "clinical-light",
      modules: formData
        .getAll("modules")
        .map(String)
        .map((key) => ({ key, label: String(formData.get(`label:${key}`) ?? "").trim() || undefined })),
      branding: {
        portalTitle: String(formData.get("portalTitle") ?? "").trim() || undefined,
        welcomeCopy: String(formData.get("welcomeCopy") ?? "").trim() || undefined,
      },
      featureFlags: {},
      seed: formData.get("seed") === "EMPTY" ? "EMPTY" : "DEMO_FIXTURES",
      billingPlan: String(formData.get("billingPlan") ?? "FOUNDING_COMP"),
      practitioner: {
        name: String(formData.get("practName") ?? "").trim(),
        email: String(formData.get("practEmail") ?? "").trim(),
      },
    };
    const result = await provisionTenant(cfg);
    if (!result.ok) redirect(`/admin/tenants/new?error=${encodeURIComponent(result.error)}`);
    redirect(
      `/admin/tenants/new?done=${cfg.slug}&email=${encodeURIComponent(result.ok ? result.practitionerEmail : "")}&pw=${encodeURIComponent(result.ok ? result.tempPassword : "")}`
    );
  }

  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Eyebrow>Platform admin</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">New tenant</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          The form builds the same config the CLI takes — one reviewable file, live on its
          subdomain the moment it saves.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>
      )}
      {searchParams.done && (
        <div className="flex flex-col gap-1 rounded-card border border-mocha bg-blush p-5 text-sm text-wine">
          <p className="font-medium">Tenant &quot;{searchParams.done}&quot; is live.</p>
          <p>Practitioner: {searchParams.email}</p>
          <p className="font-mono">Temp password (shown once): {searchParams.pw}</p>
        </div>
      )}

      <form action={provision} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Slug (subdomain)
            <input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,30}" className={fieldCls} />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-slate">
            Display name
            <input name="displayName" required className={fieldCls} />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Layout
            <select name="layoutKey" className={fieldCls}>
              <option value="dashboard-v1">dashboard-v1</option>
              <option value="journey-v1">journey-v1</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Skin
            <select name="skinKey" className={fieldCls}>
              <option value="clinical-light">clinical-light</option>
              <option value="celestial-dark">celestial-dark</option>
              <option value="warm-clay">warm-clay</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Seed
            <select name="seed" className={fieldCls}>
              <option value="DEMO_FIXTURES">DEMO_FIXTURES (fictional data, DEMO status)</option>
              <option value="EMPTY">EMPTY (real practice)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Billing plan
            <select name="billingPlan" className={fieldCls}>
              <option value="FOUNDING_COMP">FOUNDING_COMP</option>
              <option value="CARE_99">CARE_99</option>
              <option value="CARE_125">CARE_125</option>
              <option value="CARE_149">CARE_149</option>
            </select>
          </label>
        </div>

        <fieldset className="flex flex-col gap-2 rounded-card border border-line p-4">
          <legend className="px-1 text-[13px] font-semibold uppercase tracking-wide text-mocha">Modules</legend>
          {Object.values(MODULES).map((m) => (
            <label key={m.key} className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="modules" value={m.key} className="h-4 w-4 rounded border-line text-wine" />
              <span className="w-40">{m.defaultLabel}</span>
              <input name={`label:${m.key}`} placeholder="tenant's own label (optional)" className={`${fieldCls} flex-1`} />
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Portal title
            <input name="portalTitle" className={fieldCls} />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-slate">
            Welcome copy
            <input name="welcomeCopy" className={fieldCls} />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Practitioner name
            <input name="practName" required className={fieldCls} />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-slate">
            Practitioner email
            <input name="practEmail" type="email" required className={fieldCls} />
          </label>
        </div>

        <PendingButton className="self-start rounded-lg bg-wine px-6 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
          Provision tenant
        </PendingButton>
      </form>
    </main>
  );
}
