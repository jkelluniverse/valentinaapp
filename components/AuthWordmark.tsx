import { getTenantResolution } from "@/lib/tenancy";

// C29-EVENT-CHROME — the auth screens' wordmark, resolved from the request's
// tenant EXACTLY as the portal shells already do (app/practitioner/layout.tsx,
// app/space/layout.tsx): `branding.portalTitle || "veritas"`. The default
// tenant's portalTitle IS "veritas" (migration 33), so Valentina's auth
// screens render BYTE-IDENTICAL output — no baseline change, no acceptance
// needed — while every other practice's clients and practitioners see that
// practice's own name.
//
// Under C26's `unresolved` the brand line renders NOTHING: the shell's
// portalTitle is empty and the `|| "veritas"` fallback must not fire there —
// a borrowed wordmark on an unresolvable host is the exact hole C26 closed.
//
// SSR byte note: the wordmark and its trailing space render as ONE dynamic
// text node followed by an element — a boundary React SSR emits with no
// comment separator, which is what keeps the default output byte-identical.
export async function AuthWordmark() {
  const r = await getTenantResolution();
  if (r.kind === "unresolved") return null;
  const wordmark = (r.tenant.branding ?? {}).portalTitle || "veritas";
  return (
    <span className="font-headline text-lg font-semibold text-wine">
      {`${wordmark} `}
      <span className="text-mocha">✧</span>
    </span>
  );
}
