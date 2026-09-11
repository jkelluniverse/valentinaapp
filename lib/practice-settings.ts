// C25-PRACTICE-SETTING-TENANCY §2 — the one place that addresses a practice
// setting by its unique key.
//
// WHY A MODULE RATHER THAN CALL-SITE DISCIPLINE (law #5). `PracticeSetting`'s
// identity is now ("tenantId", "key"), so a write has to name a tenant — but
// no product call site knows or should know its tenant; that is precisely
// what the scoped client exists to hide. TypeScript will not let a call site
// write `where: { key }` any more (it is no longer a unique input), so the
// choice is either every call site resolving a tenant, or exactly one place
// doing it. This is that place.
//
// WHAT DID NOT CHANGE. No setting's key, value, meaning or default. A read
// still returns the practice's row or nothing; a write still creates-or-
// updates; a clear still deletes. The engage kill-switch and pause (ruling
// 19) keep reading through `findFirst({ where: { key } })` in lib/engage.ts,
// untouched by this build, and an absent row still means CLOSED.
//
// READS need no tenant: the scoped client ANDs the tenant filter into
// `findFirst` structurally, and for the default tenant that filter still ORs
// in legacy `tenantId IS NULL` rows.
//
// WRITES resolve the tenant by the SAME precedence the client uses (request
// headers → withTenantScope → nothing). With nothing, this THROWS. It does
// NOT fall back to the default tenant: ruling 24 rejected implicit
// default-tenant stamping, and a settings write with no owner is exactly the
// write that must fail rather than land in Valentina's practice. CLI callers
// state their tenant explicitly instead.

import { prisma, scopeTenantId } from "@/lib/prisma";

export type PracticeSettingRow = { id: string; key: string; value: string; tenantId: string | null };

/** The practice's row for `key`, or null. Tenant-scoped by the client. */
export async function readPracticeSetting(key: string): Promise<PracticeSettingRow | null> {
  return prisma.practiceSetting.findFirst({ where: { key } });
}

/** The practice's value for `key`, or null. */
export async function practiceSettingValue(key: string): Promise<string | null> {
  return (await readPracticeSetting(key))?.value ?? null;
}

/**
 * Create-or-update the practice's row for `key`.
 *
 * `tenantId` is for CLI callers (seeds, gate harnesses) that run outside both
 * a request and a `withTenantScope`; product code never passes it.
 */
export async function writePracticeSetting(
  key: string,
  value: string,
  opts?: { tenantId?: string },
): Promise<PracticeSettingRow> {
  const tenantId = opts?.tenantId ?? (await scopeTenantId());
  if (!tenantId) {
    throw new Error(
      `practice-settings: no tenant in scope — refusing to write "${key}" with no owner. ` +
        `Run inside a request, inside withTenantScope(tenantId, …), or state a tenantId explicitly.`,
    );
  }
  return prisma.practiceSetting.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value },
    update: { value },
  });
}

/**
 * Delete the practice's row for `key`, if any. `deleteMany` on purpose: it is
 * a filter-form write, so the scoped client ANDs the tenant filter in and one
 * practice can never clear another's setting.
 */
export async function clearPracticeSetting(key: string): Promise<number> {
  const { count } = await prisma.practiceSetting.deleteMany({ where: { key } });
  return count;
}
