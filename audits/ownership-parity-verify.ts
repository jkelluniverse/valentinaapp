/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "async_hooks";
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;

// SCOPED-CLIENT PARITY — the scoped client is used for exactly the right
// questions, and exempts nobody (P5, rulings 155 + 156).
//
// PART A — ownership parity: tenant #1 is no longer exempt from the pre-check.
// PART B — global-by-intent reads do not go through the scoped client at all.
//
// WHAT WAS WRONG. lib/prisma.ts guarded every unique write (update / delete /
// upsert) with a fail-closed ownership pre-check — and skipped it entirely when
// the scope was the default tenant:
//
//     if (tenantId !== DEFAULT_TENANT_ID) {
//       await assertUniqueWriteAllowed(...);
//     }
//
// It was written as a performance shortcut. It was also a SECURITY ASYMMETRY:
// every other practice got a check tenant #1 did not. So P5 does not merely
// stop privileging her — it removes an exemption, which is the direction that
// matters.
//
// WHAT THIS PROVES, and it needs all three legs (ruling 110). A refusal on its
// own proves nothing: a scope that refuses EVERYTHING would pass legs 1 and 2
// and be catastrophically broken.
//   1. HER scope → another tenant's row  → REFUSED   (the newly closed hole)
//   2. another tenant's scope → HER row  → REFUSED   (already held; regression guard)
//   3. HER scope → HER OWN row           → SUCCEEDS  (the positive control)
// Plus: after each refusal the target row is re-read and must be UNCHANGED —
// "it threw" and "it did not write" are different claims.
//
// RULING 163 — THE INSTRUMENT ERROR THAT WOULD HAVE BEEN A PHANTOM EMERGENCY.
// READ THIS BEFORE EDITING ANY LEG. The first version of this gate reported
// leg 1's cross-tenant write SUCCEEDING — an alarm that read exactly like a
// live security hole in production. It was not. It was this gate lying about
// itself.
//
// THE MECHANISM. The scoped client returns a LAZY THENABLE: requestTenantId()
// runs when the operation is first AWAITED, not when it is written. So this
//
//     const p = withTenantScope(T, () => prisma.priceBook.update({ ... }));
//     await p;                          // <-- await OUTSIDE the scope
//
// leaves the AsyncLocalStorage context before the tenant is ever read. The
// scope resolves to null and EVERY operation becomes an unscoped passthrough —
// which of course "succeeds" at writing another tenant's row. Every await of a
// scoped operation must happen INSIDE its own withTenantScope callback.
//
// WHAT CAUGHT IT, and this is the transferable part: LEG 2 FAILED — the leg
// that was supposed to already hold, before any of P5's changes. A gate whose
// CONTROL leg fails is telling you about ITSELF, not about the system. Chase
// the instrument first; a real regression does not break the thing that was
// already true. (Rulings 125 / 153: test the instrument.)
//
// Self-cleaning: one throwaway tenant and two settings rows, removed first/last.
//   DATABASE_URL=...scratch npx tsx audits/ownership-parity-verify.ts

const TENANT_B = "tnt_ownparity_b_00001";
// PriceBook on purpose: a scoped model with id + tenantId and no required
// relation, and — unlike PracticeSetting — no standing invariant of its own. The
// first version used PracticeSetting and reddened practice-setting-verify, whose
// A3 scanner requires every settings row be addressed by its tenant-qualified
// key. That gate was right; this gate moved rather than the assertion (ruling 157).
const NAME_HERS = "ownparity-hers";
const NAME_THEIRS = "ownparity-theirs";

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  const { rawPrisma } = await import("../lib/prisma-internal");
  const { prisma } = await import("../lib/prisma");
  const { withTenantScope } = await import("../lib/tenancy/tenant-scope");
  const { DEFAULT_TENANT_ID } = await import("../lib/tenancy/scope");

  const cleanup = async () => {
    await rawPrisma.priceBook.deleteMany({ where: { name: { in: [NAME_HERS, NAME_THEIRS] } } }).catch(() => {});
    await rawPrisma.tenant.deleteMany({ where: { id: TENANT_B } }).catch(() => {});
  };
  await cleanup();

  await rawPrisma.tenant.create({
    data: { id: TENANT_B, slug: "ownparity-b", displayName: "Ownership Parity B", status: "ACTIVE" },
  });
  const hers = await rawPrisma.priceBook.create({
    data: { tenantId: DEFAULT_TENANT_ID, name: NAME_HERS, amountCents: 1000 },
    select: { id: true },
  });
  const theirs = await rawPrisma.priceBook.create({
    data: { tenantId: TENANT_B, name: NAME_THEIRS, amountCents: 1000 },
    select: { id: true },
  });
  const valueOf = async (id: string) =>
    (await rawPrisma.priceBook.findUnique({ where: { id }, select: { amountCents: true } }))?.amountCents;

  const attempt = async (scope: string, id: string) => {
    try {
      // AWAIT INSIDE THE SCOPE. The scoped client returns a LAZY thenable —
      // requestTenantId() runs when the promise is first awaited, not when the
      // call is written. Returning it from withTenantScope and awaiting outside
      // loses the AsyncLocalStorage context, the resolver sees no ambient
      // tenant, and every op becomes an unscoped passthrough. The first version
      // of this gate did exactly that and reported a cross-tenant write
      // succeeding — a FALSE ALARM that looked like a security hole.
      await withTenantScope(scope, async () => {
        await prisma.priceBook.update({ where: { id }, data: { amountCents: 9999 } });
      });
      return { refused: false, why: "" };
    } catch (e) {
      return { refused: true, why: e instanceof Error ? e.message : String(e) };
    }
  };

  try {
    log(`# SCOPED-CLIENT PARITY — ${new Date().toISOString()}`);

    log(`\n## 1 — HER scope reaching ANOTHER tenant's row (the exemption that existed)`);
    const a1 = await attempt(DEFAULT_TENANT_ID, theirs.id);
    check("refused", a1.refused, a1.why.slice(0, 90));
    check("and the other tenant's row is UNCHANGED — it threw AND did not write", (await valueOf(theirs.id)) === 1000, String(await valueOf(theirs.id)));

    log(`\n## 2 — another tenant's scope reaching HER row (held before; regression guard)`);
    const a2 = await attempt(TENANT_B, hers.id);
    check("refused", a2.refused, a2.why.slice(0, 90));
    check("and HER row is UNCHANGED", (await valueOf(hers.id)) === 1000, String(await valueOf(hers.id)));

    log(`\n## 3 — POSITIVE CONTROL: her scope writing HER OWN row still works`);
    const a3 = await attempt(DEFAULT_TENANT_ID, hers.id);
    check(
      "succeeds — the check is an ownership test, not a blanket refusal",
      !a3.refused && (await valueOf(hers.id)) === 9999,
      a3.refused ? `REFUSED: ${a3.why.slice(0, 80)}` : `amountCents=${await valueOf(hers.id)}`,
    );
  } finally {
    await cleanup();
    console.log("~ probe tenant and settings removed");
  }

  // ---- PART B: ruling 156's count ----
  // "Is this email taken?" is a WHOLE-DATABASE question, because User.email is
  // @unique across every tenant. Five sites asked it through the scoped client
  // and answered "free" for an address taken in another practice. The first
  // survey of them found three, because five inline queries have to be spotted
  // BY EYE — so the answer now lives in one named helper that a count can pin
  // (ruling 128), and this fails if a sixth inline lookup ever appears.
  log(`\n## 4 — global-by-intent email lookups go through the helper, not the scoped client`);
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  const { execSync } = await import("child_process");
  const ROOT = join(__dirname, "..");
  const scopedEmailLookups = execSync(
    `git grep -lE 'prisma\\.user\\.find(Unique|First)\\(\\{ where: \\{ email' -- 'app/**' 'lib/**' || true`,
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/rawPrisma/.test(readFileSync(join(ROOT, f), "utf8").split("\n").find((l) => /from "@\/lib\/prisma/.test(l)) ?? ""));
  // The three that REMAIN are correct: they resolve the CURRENT signed-in user
  // by email to check a role, where scoping to this request's tenant is the
  // point — a user from another practice must not resolve.
  const EXPECTED_SCOPED = [
    "app/api/agreement-templates/[id]/files/[fileId]/route.ts",
    "app/api/agreements/[id]/files/[fileId]/route.ts",
    "app/api/agreements/[id]/pdf/route.ts",
  ];
  const unexpected = scopedEmailLookups.filter((f) => !EXPECTED_SCOPED.includes(f));
  check(
    "no NEW scoped user-by-email lookup has appeared (the 3 that remain resolve the signed-in user, where scoping is correct)",
    unexpected.length === 0,
    unexpected.length ? `UNEXPECTED: ${unexpected.join(", ")}` : `${scopedEmailLookups.length} scoped lookup(s), all expected`,
  );
  const helper = readFileSync(join(ROOT, "lib/user-identity.ts"), "utf8");
  check(
    "the helper returns a BOOLEAN, never a row — a row would leak another practice's user across the boundary",
    /Promise<boolean>/.test(helper) && !/select: \{ id: true, [^}]/.test(helper),
    "emailInUse(): Promise<boolean>",
  );
  const users = execSync(`git grep -c 'emailInUse(' -- 'app/**' 'lib/**' || true`, { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  check(
    "and it is used at the five converted sites",
    users.filter((l) => !l.startsWith("lib/user-identity.ts")).length === 5,
    users.map((l) => l.split(":")[0]).join(" · "),
  );

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("gate error:", e?.stack ?? e); process.exit(1); });
