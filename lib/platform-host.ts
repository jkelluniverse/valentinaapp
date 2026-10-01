// PLATFORM SPLIT P2 (ruling 84) — "is this request on the PLATFORM's own host?"
//
// Deliberately PURE: no prisma, no next, no imports at all. That is what lets
// middleware (edge runtime) and server components share ONE definition, instead
// of the literal-duplication middleware needed for DEFAULT_TENANT_SLUG.
//
// This answers a question about the HOST STRING ONLY. It is not tenant
// resolution and must never become it: an unmapped host is still resolved by
// lib/tenancy, and P3 is what stops that landing on a practice.
export const PLATFORM_NAME = "Psychefolio";

export function isPlatformHost(host: string | null | undefined): boolean {
  const platformDomain = process.env.PLATFORM_DOMAIN;
  if (!platformDomain || !host) return false;
  const clean = host.split(",")[0].trim().split(":")[0].toLowerCase();
  // The bare apex IS the platform host (ruling 84/85). `www` is included
  // because it is the same site by universal convention, it is already in
  // RESERVED_SLUGS so it can never be a practice, and it was ALSO publicly
  // serving tenant #1's marketing under the platform's name — the same defect
  // P2.2 exists to stop. Scope judgment, disclosed in the P2 report.
  return clean === platformDomain || clean === `www.${platformDomain}`;
}
