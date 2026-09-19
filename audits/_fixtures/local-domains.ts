// P3.3 — THE LOOPBACK MAPPING, AND IT IS A FIXTURE, NOT A MIGRATION.
//
// Until P3.3 an unmapped host silently resolved to tenant #1, and that fallback
// was what every gate on `localhost` was quietly standing on: `DEFAULT_HOST =
// "localhost:3000" // no PLATFORM_DOMAIN suffix → default tenant`. With the
// fallback gone, `localhost` is exactly what it now honestly is — a host nobody
// owns — and nineteen of the thirty-eight standing entries went red on the
// probe sweep that measured this before a line of it shipped.
//
// WHY NOT A MIGRATION. Seeding `localhost` → tenant #1 in a migration would put
// the rows in PRODUCTION, which re-states "some host belongs to Valentina by
// default" as data — the same claim ruling 85 removed, in a new location. A
// production request cannot arrive on `localhost` in any case (Railway's edge
// sets the public host, and both resolvers prefer x-forwarded-host), so the row
// would be unreachable AND untrue. Fixtures belong in fixtures.
//
// WHAT IT ACTUALLY IMPROVES. A gate that used to exercise the fallback now
// exercises the TenantDomain mapping — which is the path production uses. The
// fixture is closer to production than the thing it replaces, not further.
//
// IDEMPOTENT AND NEVER DELETED. Gates share one scratch database and run in
// sequence; a fixture some gate tore down in cleanup would make the next gate's
// result depend on ordering. This upserts and leaves the rows in place.
import { rawPrisma } from "../../lib/prisma-internal";
import { DEFAULT_TENANT_ID } from "../../lib/tenancy/scope";

/** Hosts a gate or a local dev server can arrive on. Ports are stripped by both
 *  resolvers before lookup, so `localhost` covers `localhost:3000`, `:3131` and
 *  every other spawned port. */
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

export async function seedLocalDomains(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  // The refusal lives HERE, not in each caller, because this helper is the one
  // thing in the gate surface that WRITES before a gate's own guard has
  // necessarily run. A fixture that seeded host mappings into a production
  // database would be the worst possible bug in this file.
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("seedLocalDomains: DATABASE_URL required (scratch DB)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("seedLocalDomains: refusing to run against a Railway database");
  for (const host of LOCAL_HOSTS) {
    await rawPrisma.tenantDomain.upsert({
      where: { host },
      update: { tenantId },
      create: { id: `td_local_${host.replace(/[^a-z0-9]/gi, "_")}`, host, tenantId },
    });
  }
}
