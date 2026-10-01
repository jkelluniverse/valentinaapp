import type { Metadata } from "next";
import { getTenantResolution } from "@/lib/tenancy";

// C29-EVENT-CHROME — the auth screens' TAB chrome (title, application-name,
// apple-web-app title) resolves from the request's tenant, like the wordmark.
// The default tenant's portalTitle "veritas" capitalizes to exactly "Veritas",
// the strings the root layout has always emitted — byte-identical for her.
// Under C26's `unresolved`, the tab says the page's own existing heading
// ("Sign in") rather than borrowing anyone's name. The layout's other fields
// (icons, manifest, description) merge through untouched.
export async function tenantAuthMetadata(): Promise<Metadata> {
  const r = await getTenantResolution();
  if (r.kind === "unresolved") {
    return { title: "Sign in", applicationName: "Sign in", appleWebApp: { capable: true, title: "Sign in", statusBarStyle: "default" } };
  }
  const raw = (r.tenant.branding ?? {}).portalTitle || "veritas";
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { title: name, applicationName: name, appleWebApp: { capable: true, title: name, statusBarStyle: "default" } };
}
