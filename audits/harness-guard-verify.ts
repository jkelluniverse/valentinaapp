import { spawnSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// HARNESS-GUARD (rulings 91/92) — the harness that reports on the gates is
// itself a gate, and its red path is RE-PROVEN every sweep, not demonstrated
// once. regress.sh printed FAIL lines while exiting 0 from its first commit
// until P1's first red exposed it (the script exited with the last echo's
// status); every historical green stood on the printed PASS lines, read by a
// human every time — luck reinforced by discipline, not a design that held.
// This gate runs the REAL scripts/regress.sh — not a copy of its logic — in
// its two REGRESS_SELFTEST modes and asserts the exit code agrees with the
// printed lines in both directions.
//
// No port, no database writes: the selftest entries are `true` and `false`.

let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`- ${ok ? "✓" : "✗"} ${name} — ${detail}`);
  if (!ok) failed++;
}

function runSelftest(mode: "red" | "green") {
  const logdir = mkdtempSync(join(tmpdir(), `harness-guard-${mode}-`));
  const r = spawnSync("bash", ["scripts/regress.sh"], {
    env: {
      ...process.env,
      REGRESS_SELFTEST: mode,
      REGRESS_LOGDIR: logdir,
      // The selftest entries need no database, but regress.sh refuses to start
      // without DATABASE_URL by design — pass through whatever the sweep has.
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://selftest-not-a-db",
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function main() {
  console.log("# HARNESS-GUARD VERIFY — regress.sh's exit code agrees with its printed lines\n");

  const red = runSelftest("red");
  check(
    "RED: a FAIL line ends the sweep with exit 1",
    red.status === 1,
    `exit=${red.status}`,
  );
  check(
    "RED: the failing entry is named as FAIL",
    red.out.includes("FAIL selftest-fail"),
    red.out.trim().split("\n").slice(0, 3).join(" | "),
  );
  check(
    "RED: the run announces FAILURE with a count, never COMPLETE",
    red.out.includes("REGRESSION RUN FAILED — 1 entry red") && !red.out.includes("REGRESSION RUN COMPLETE"),
    red.out.trim().split("\n").pop() ?? "",
  );

  const green = runSelftest("green");
  check(
    "GREEN: an all-pass run exits 0",
    green.status === 0,
    `exit=${green.status}`,
  );
  check(
    "GREEN: the run announces COMPLETE, never FAILED",
    green.out.includes("REGRESSION RUN COMPLETE") && !green.out.includes("REGRESSION RUN FAILED"),
    green.out.trim().split("\n").pop() ?? "",
  );

  console.log(`\nHARNESS-GUARD VERIFY ${failed === 0 ? `PASS — 5/5` : `FAILED — ${5 - failed}/5`}`);
  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
