import { spawn, execSync, execFileSync, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { DEFAULT_TENANT_ID } from "../lib/tenancy/scope";
import { withTenantScope } from "../lib/tenancy/tenant-scope";
import en from "../messages/en/practitionerSettings.json";
import es from "../messages/es/practitionerSettings.json";

// C24.1-TENANT-SCOPE §4 (task #78) acceptance — the practitioner settings
// i18n pass, and spec Verify item 10.
//
// What it proves, against the BUILT app:
//   · /practitioner/settings renders in BOTH locales (User.locale, `?lang=`
//     override per ruling 14) — every catalog string actually appears
//   · the wording is IDENTICAL to what shipped before the pass: each English
//     string is matched against `git show HEAD:app/practitioner/settings/
//     page.tsx`, so this is provably an i18n MOVE, not a copy rewrite
//   · the two catalogs have identical key sets
//
// It uses the SCOPED client from a CLI context wrapped in withTenantScope —
// i.e. it dogfoods §1 rather than reaching for the raw client (no
// guard-prisma allowlist entry needed). Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/settings-i18n-verify.ts

const PORT = 3131;
const BASE = `http://localhost:${PORT}`;
const EMAIL = "settings-i18n-probe@fixture.test";
const PASSWORD = "settings-i18n-probe-2026";

const report: string[] = [];
const results: { name: string; pass: boolean; note?: string }[] = [];
function log(s: string) {
  report.push(s);
  console.log(s);
}
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

type Leaf = { path: string; value: string };
function leaves(obj: unknown, prefix = ""): Leaf[] {
  const out: Leaf[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push({ path, value: v });
    else if (v && typeof v === "object") out.push(...leaves(v, path));
  }
  return out;
}

const norm = (s: string) => s.replace(/&amp;/g, "&").replace(/&apos;|&#x27;/g, "'").replace(/\s+/g, " ").trim();

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ");
}

async function signIn(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } }).catch(() => undefined);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  log(`# task #78 — /practitioner/settings i18n verify — ${new Date().toISOString()}`);
  await cleanup();

  // ---- 1. catalog shape, before any HTTP ----
  const enLeaves = leaves(en.practitionerSettings);
  const esLeaves = leaves(es.practitionerSettings);
  const enPaths = enLeaves.map((l) => l.path).sort();
  const esPaths = esLeaves.map((l) => l.path).sort();
  check(
    "the two catalogs have IDENTICAL key sets",
    JSON.stringify(enPaths) === JSON.stringify(esPaths),
    `en=${enPaths.length} keys · es=${esPaths.length} keys · diff=${enPaths
      .filter((k) => !esPaths.includes(k))
      .concat(esPaths.filter((k) => !enPaths.includes(k)))
      .join(", ") || "none"}`,
  );
  check(
    "no catalog string is empty, and no Spanish string is a copy of the English one it translates",
    enLeaves.every((l) => l.value.trim().length > 0) &&
      esLeaves.every((l) => l.value.trim().length > 0) &&
      esLeaves.filter((l, i) => l.value === enLeaves[i].value).every((l) => ["language.en", "language.es"].includes(l.path)),
    `only the two language NAMES are legitimately identical in both catalogs`,
  );

  // ---- 2. the English wording is what shipped before the pass ----
  // Pinned to the last commit whose page still carried the raw strings
  // (939a663, C24-NESTED-STAMP): the gate was written against an uncommitted
  // tree where HEAD *was* the pre-pass page; once the i18n pass was committed
  // a HEAD reference would compare the catalog against the very page the
  // strings were moved OUT of, failing forever.
  const PRE_PASS_COMMIT = "939a663";
  const shipped = norm(
    execFileSync("git", ["show", `${PRE_PASS_COMMIT}:app/practitioner/settings/page.tsx`], {
      encoding: "utf8",
      cwd: process.cwd(),
    }),
  );
  const missing: string[] = [];
  for (const l of enLeaves) {
    // The one templated string: the old page interpolated the same value.
    const needle = norm(l.value).replace("{hours}", "{config.cancelCutoffHours}");
    if (!shipped.includes(needle)) missing.push(`${l.path} → "${l.value}"`);
  }
  check(
    "EVERY English string is byte-identical (whitespace-normalised) to the pre-pass page — an i18n MOVE, not a copy rewrite",
    missing.length === 0,
    missing.length ? missing.slice(0, 6).join(" · ") : `${enLeaves.length} strings matched against HEAD`,
  );

  // ---- 3. both locales actually render ----
  log(`~ starting built app on :${PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    AUTH_TRUST_HOST: "true",
  };
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env,
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        /* booting */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    await prisma.user.create({
      data: {
        email: EMAIL,
        name: "Settings i18n Probe",
        role: "PRACTITIONER",
        active: true,
        mustChangePassword: false,
        locale: "en",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
      },
    });
    const cookie = await signIn(EMAIL, PASSWORD);
    const fetchPage = async (qs: string) => {
      const res = await fetch(`${BASE}/practitioner/settings${qs}`, { headers: { Cookie: cookie } });
      return { status: res.status, text: visibleText(await res.text()) };
    };
    const enPage = await fetchPage("");
    const esPage = await fetchPage("?lang=es");
    check("the page renders for a signed-in practitioner (EN, User.locale)", enPage.status === 200, `status ${enPage.status}`);
    check("the page renders in Spanish with ?lang=es (ruling 14)", esPage.status === 200, `status ${esPage.status}`);

    // Every catalog string that is reachable on THIS page state must be
    // present. Two rows are conditional on data the probe has none of, so
    // they are named rather than silently excluded.
    const CONDITIONAL = new Set([
      "practice.toolsLabel", // tenant tool modules (Valentina has none)
      "practice.toolsHint",
      "policy.proportionality", // only when the late fee exceeds the session rate
      "deletion.statusOpen", // only with an open/acknowledged deletion request
      "deletion.statusAcknowledged",
      "deletion.promise",
      "deletion.acknowledge",
      "deletion.close",
      "saved.password",
      "saved.email",
      "saved.language",
      "saved.policy",
      "saved.assist",
      "saved.deletion",
      "errors.pw-rate",
      "errors.pw-short",
      "errors.pw-match",
      "errors.pw-current",
      "errors.email-rate",
      "errors.email-format",
      "errors.email-same",
      "errors.email-taken",
      "errors.policy",
    ]);
    const absent = (page: string, ls: Leaf[]) =>
      ls
        .filter((l) => !CONDITIONAL.has(l.path))
        .filter((l) => !page.includes(norm(l.value).replace(/\{\w+\}/g, "")) )
        .filter((l) => {
          // Templated strings: check their literal fragments.
          const parts = norm(l.value).split(/\{\w+\}/).map((s) => s.trim()).filter((s) => s.length > 3);
          return !parts.every((frag) => page.includes(frag));
        })
        .map((l) => l.path);
    const enAbsent = absent(enPage.text, enLeaves);
    const esAbsent = absent(esPage.text, esLeaves);
    check(
      "EN: every unconditional catalog string appears on the rendered page",
      enAbsent.length === 0,
      enAbsent.join(", ") || `${enLeaves.length - CONDITIONAL.size} strings present`,
    );
    check(
      "ES: every unconditional catalog string appears on the rendered page",
      esAbsent.length === 0,
      esAbsent.join(", ") || `${esLeaves.length - CONDITIONAL.size} strings present`,
    );
    check(
      "the two renders are genuinely different documents (the ES page is not the EN page)",
      enPage.text !== esPage.text &&
        enPage.text.includes(en.practitionerSettings.practice.heading) &&
        esPage.text.includes(es.practitionerSettings.practice.heading),
    );
    check(
      "no English label leaks into the Spanish render (the conspicuous section headings)",
      !esPage.text.includes("Session-change policy") && !esPage.text.includes("Deletion requests"),
    );
    check(
      "the referrals link row is in the catalog in both languages (the row task #78 called out)",
      Boolean(en.practitionerSettings.practice.referralsLabel) &&
        Boolean(es.practitionerSettings.practice.referralsLabel) &&
        enPage.text.includes(en.practitionerSettings.practice.referralsLabel) &&
        esPage.text.includes(es.practitionerSettings.practice.referralsLabel),
    );
  } finally {
    server.kill();
    await cleanup();
    log("~ probe practitioner removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  const summary =
    failed === 0
      ? `\nSETTINGS-I18N VERIFY PASS — ${results.length}/${results.length}`
      : `\n${failed} CHECK(S) FAILED — ${results.length - failed}/${results.length}`;
  console.log(summary);

  // Ruling 17 — the log is written BY the gate.
  mkdirSync(join(__dirname, "settings-i18n"), { recursive: true });
  writeFileSync(
    join(__dirname, "settings-i18n", "VERIFY-LOG.md"),
    [
      "# task #78 — /practitioner/settings i18n — acceptance log",
      "",
      `Run: ${new Date().toISOString()} · \`npx tsx audits/settings-i18n-verify.ts\` against the BUILT app on :${PORT}`,
      `Database: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@")}`,
      "",
      ...report,
      summary,
      "",
    ].join("\n"),
  );
  if (failed > 0) process.exit(1);
}

// C24.1 §2 — CLI harness: state the tenant once (and dogfood the mechanism).
withTenantScope(DEFAULT_TENANT_ID, main)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
    try {
      execSync(`pkill -f "next start -p ${PORT}"`);
    } catch {
      /* none */
    }
  });
