#!/bin/bash
# THE STANDING REGRESSION SET — 45 entries, stamp-audit LAST (rulings 38/48
# count discipline: this committed script IS the enumeration; a sweep total is
# never restated without it). Run against a SCRATCH database only — the gates
# refuse Railway URLs themselves, and several provision + tear down fixtures.
#
#   DATABASE_URL=postgresql://...scratch PAYMENT_TOKEN_ENC_KEY=... scripts/regress.sh
#
# REGRESS_SELFTEST (rulings 91/92 — the harness that reports on the gates is
# itself a gate): "red" runs one passing and one failing synthetic entry, and
# the guard at the bottom must end the script with exit 1; "green" runs the
# passing entry alone and must exit 0. harness-guard re-proves both directions
# on THIS script every sweep, instead of trusting a one-time demonstration.
cd "$(dirname "$0")/.." || exit 1
if [ -z "$DATABASE_URL" ]; then echo "DATABASE_URL required (scratch DB)"; exit 1; fi
LOGDIR="${REGRESS_LOGDIR:-/tmp/regress-logs}"
mkdir -p "$LOGDIR"
FAILURES=0
run() {
  local name="$1"; shift
  if "$@" > "$LOGDIR/$name.log" 2>&1; then
    echo "PASS $name :: $(grep -Eo '[0-9]+/[0-9]+|ALL CHECKS PASS|PASS' "$LOGDIR/$name.log" | tail -1)"
  else
    echo "FAIL $name (exit $?) — see $LOGDIR/$name.log"
    FAILURES=$((FAILURES + 1))
  fi
}
if [ -n "$REGRESS_SELFTEST" ]; then
  [ "$REGRESS_SELFTEST" = "red" ] && run selftest-fail false
  run selftest-pass true
else
run lint-wall            npm run lint:wall
run guard-prisma         npx tsx scripts/guard-prisma.ts
run tsc                  npx tsc --noEmit
run build                npm run build
run smoke                npm run smoke
run smoke-writes         npm run smoke:writes
run signup               npx tsx audits/signup/verify.ts
run capture              npx tsx audits/capture/verify.ts
run referral             npx tsx audits/referral/verify.ts
run engage               npx tsx audits/engage/verify.ts
run tenant-scope         npx tsx audits/tenant-scope-verify.ts
run nested-stamp         npx tsx audits/nested-stamp-verify.ts
run settings-i18n        npx tsx audits/settings-i18n-verify.ts
run platform-phase2      npx tsx audits/platform/phase2-verify.ts
run platform-phase3      npx tsx audits/platform/phase3-verify.ts
run platform-phase5      npx tsx audits/platform/phase5-verify.ts
run platform-verify      npx tsx audits/platform/verify.ts
run c21                  npx tsx audits/agreements/c21-verify.ts
run c20                  npx tsx audits/agreements/c20-verify.ts
run v31                  npx tsx audits/agreements/v31-verify.ts
run c12x                 npx tsx prisma/fixtures/c12x-verify.ts
run onboarding-complete  npx tsx audits/onboarding/complete-verify.ts
run onboarding-stage1    npx tsx audits/onboarding/stage1-verify.ts
run onboarding-update    npx tsx audits/onboarding/update-verify.ts
run onboarding-ui        npx tsx audits/onboarding/ui-verify.ts
run onboarding-discovery npx tsx audits/onboarding/discovery-verify.ts
run password-reset       npx tsx audits/password-reset/verify.ts
run amd06                npx tsx audits/amd06/verify.ts
run practice-setting     npx tsx audits/practice-setting-verify.ts
run email-identity       npx tsx audits/email-identity-verify.ts
run fail-closed-tenancy  npx tsx audits/fail-closed-tenancy-verify.ts
run event-chrome         npx tsx audits/event-chrome-verify.ts
run demo-path            npx tsx audits/demo-path-verify.ts
run founders            npx tsx audits/founders-verify.ts
run gate-hygiene         npx tsx audits/gate-hygiene-verify.ts
run port-uniqueness      npx tsx audits/port-uniqueness-verify.ts
run nexturl-origin       npx tsx audits/nexturl-origin-verify.ts
run host-tenancy         npx tsx audits/host-tenancy-verify.ts
run platform-writes      npx tsx audits/platform-writes-verify.ts
run platform-frontdoor   npx tsx audits/platform-frontdoor-verify.ts
run engage-idempotency   npx tsx audits/engage-send-idempotency-verify.ts
run ownership-parity     npx tsx audits/ownership-parity-verify.ts
run tick-refusal         npx tsx audits/tick-refusal-verify.ts
run harness-guard        npx tsx audits/harness-guard-verify.ts
run stamp-audit          npx tsx audits/tenant-stamp-audit.ts
fi
# A FAIL line must be a failed SWEEP: before this guard the script exited with
# the last echo's status, so a red sweep reported exit 0 to any unwatched
# caller (found on P1's first red — the printed lines were always the real
# signal, but an exit code that lies is the silent-false-green class).
if [ "$FAILURES" -gt 0 ]; then
  echo "=== REGRESSION RUN FAILED — $FAILURES entr$( [ "$FAILURES" -eq 1 ] && echo y || echo ies) red ==="
  exit 1
fi
echo "=== REGRESSION RUN COMPLETE ==="
