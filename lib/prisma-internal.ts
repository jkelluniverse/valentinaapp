import { PrismaClient } from "@prisma/client";

// The RAW Prisma client — tenant-blind by definition.
//
// Feature code must never import this file: `@/lib/prisma` exports the
// tenant-scoped client (same call surface, scope injected structurally).
// Direct raw access is reserved for the platform's own plumbing and is
// enforced by scripts/guard-prisma.ts at build time; every legitimate
// importer is justified in docs/PRISMA-ALLOWLIST.md.

const globalForPrisma = globalThis as unknown as { rawPrisma?: PrismaClient };

export const rawPrisma = globalForPrisma.rawPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.rawPrisma = rawPrisma;
