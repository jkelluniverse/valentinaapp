import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// PLATFORM Phase 0 — the tenant-scoped data-access layer. Root/practice
// tables are queried THROUGH this layer with the tenant filter injected, so
// cross-tenant reads are impossible rather than merely avoided. Legacy rows
// (tenantId null) belong to the default tenant and stay visible to it.
//
// Per-client tables (record items, notes, charges, …) inherit scope through
// their user linkage: their clientId always points at a tenant-scoped User
// reached through this layer. The strangler extends direct scoping to them
// in later phases; feature code migrates onto tenantDb as it is touched.

// The default tenant's id is fixed by the Phase 0 migration. Legacy rows
// (tenantId null) belong to the DEFAULT tenant ONLY — any other tenant sees
// strictly its own rows.
export const DEFAULT_TENANT_ID = "tnt_valentina_000000001";

const scope = (tenantId: string) =>
  tenantId === DEFAULT_TENANT_ID
    ? { OR: [{ tenantId }, { tenantId: null }] }
    : { tenantId };

export function tenantDb(tenantId: string) {
  return {
    users: {
      findMany: (args?: Prisma.UserFindManyArgs) =>
        prisma.user.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
      findFirst: (args?: Prisma.UserFindFirstArgs) =>
        prisma.user.findFirst({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
      count: (args?: Prisma.UserCountArgs) =>
        prisma.user.count({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    invites: {
      findMany: (args?: Prisma.InviteFindManyArgs) =>
        prisma.invite.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
      findFirst: (args?: Prisma.InviteFindFirstArgs) =>
        prisma.invite.findFirst({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    leads: {
      findMany: (args?: Prisma.LeadFindManyArgs) =>
        prisma.lead.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    worksheets: {
      findMany: (args?: Prisma.WorksheetFindManyArgs) =>
        prisma.worksheet.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
      findFirst: (args?: Prisma.WorksheetFindFirstArgs) =>
        prisma.worksheet.findFirst({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    prompts: {
      findMany: (args?: Prisma.PromptFindManyArgs) =>
        prisma.prompt.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    courses: {
      findMany: (args?: Prisma.CourseFindManyArgs) =>
        prisma.course.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    priceBook: {
      findMany: (args?: Prisma.PriceBookFindManyArgs) =>
        prisma.priceBook.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
    practiceSettings: {
      findMany: (args?: Prisma.PracticeSettingFindManyArgs) =>
        prisma.practiceSetting.findMany({ ...args, where: { AND: [scope(tenantId), args?.where ?? {}] } }),
    },
  };
}
