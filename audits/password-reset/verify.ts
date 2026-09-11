import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { requestPasswordReset, resetPassword } from "../../app/forgot/actions";
import { DEFAULT_TENANT_ID } from "../../lib/tenancy/scope";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";

// PASSWORD-RESET verify — the real actions against the fixture roster.
// Server actions end in redirect() (a thrown NEXT_REDIRECT); the harness
// treats the redirect target as the observable outcome.
//   DATABASE_URL=...scratch npx tsx audits/password-reset/verify.ts

const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

// Run an action, return the redirect target it threw.
async function redirectOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(no redirect)";
  } catch (e) {
    const digest = (e as { digest?: string })?.digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2] ?? digest;
    throw e;
  }
}
const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

async function main() {
  log(`# PASSWORD-RESET verify — ${new Date().toISOString()}`);
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;
  const ruth = await prisma.user.findUnique({ where: { email: "ruth@fixture.test" } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: maria.id } });

  // ---- Request path ----
  log(`\n## Request`);
  let dest = await redirectOf(() => requestPasswordReset(form({ email: "maria@fixture.test" })));
  check("known address → quiet success", dest.includes("sent=1"), dest);
  const created = await prisma.passwordResetToken.findFirst({ where: { userId: maria.id, consumedAt: null } });
  check("token row created (hashed, 60min expiry)", Boolean(created && created.expiresAt > new Date()));

  dest = await redirectOf(() => requestPasswordReset(form({ email: "nobody@fixture.test" })));
  check("unknown address → the SAME quiet success (no enumeration)", dest.includes("sent=1"), dest);
  if (ruth) {
    dest = await redirectOf(() => requestPasswordReset(form({ email: "ruth@fixture.test" })));
    const ruthTokens = await prisma.passwordResetToken.count({ where: { userId: ruth.id } });
    check("deactivated account → quiet success, but NO token", dest.includes("sent=1") && ruthTokens === 0);
  }
  dest = await redirectOf(() => requestPasswordReset(form({ email: "not-an-email" })));
  check("malformed address → format error", dest.includes("error=format"), dest);

  // ---- Reset path (a token we know the raw value of, same creation code) ----
  log(`\n## Reset`);
  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: maria.id,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const before = await prisma.user.findUnique({ where: { id: maria.id }, select: { sessionVersion: true } });

  dest = await redirectOf(() => resetPassword(raw, form({ next: "short", confirm: "short" })));
  check("too-short password rejected", dest.includes("error=short"), dest);
  dest = await redirectOf(() => resetPassword(raw, form({ next: "new-pass-123", confirm: "different-1" })));
  check("mismatched confirm rejected", dest.includes("error=match"), dest);

  dest = await redirectOf(() => resetPassword(raw, form({ next: "new-pass-123", confirm: "new-pass-123" })));
  check("valid reset lands on sign-in with the banner", dest.includes("/login?reset=1"), dest);
  const after = await prisma.user.findUnique({
    where: { id: maria.id },
    select: { sessionVersion: true, passwordHash: true },
  });
  check("new password actually set", await bcrypt.compare("new-pass-123", after?.passwordHash ?? ""));
  check("sessionVersion bumped — every open session revoked", (after?.sessionVersion ?? 0) > (before?.sessionVersion ?? 0));
  const open = await prisma.passwordResetToken.count({ where: { userId: maria.id, consumedAt: null } });
  check("ALL outstanding reset links burned (including the emailed one)", open === 0);

  dest = await redirectOf(() => resetPassword(raw, form({ next: "again-12345", confirm: "again-12345" })));
  check("second use of the same link → expired", dest.includes("error=expired"), dest);

  const staleRaw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: maria.id,
      tokenHash: createHash("sha256").update(staleRaw).digest("hex"),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  dest = await redirectOf(() => resetPassword(staleRaw, form({ next: "again-12345", confirm: "again-12345" })));
  check("expired link → expired", dest.includes("error=expired"), dest);
  dest = await redirectOf(() => resetPassword("made-up-token", form({ next: "again-12345", confirm: "again-12345" })));
  check("unknown link → expired (no oracle)", dest.includes("error=expired"), dest);

  // Restore the fixture password so the roster stays sign-in-able.
  await prisma.user.update({
    where: { id: maria.id },
    data: { passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: maria.id } });

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync(join(__dirname), { recursive: true });
  writeFileSync(join(__dirname, "VERIFY-LOG.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

// C24.1-TENANT-SCOPE §2 — this harness runs from the CLI, where the scoped
// client has no request to resolve a tenant from, so it would write NULL
// tenantIds (and fail the null-tenant invariant audit). withTenantScope
// states the tenant ONCE for everything beneath it, including rows the
// product libraries it drives write on its behalf.
withTenantScope(DEFAULT_TENANT_ID, main)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
