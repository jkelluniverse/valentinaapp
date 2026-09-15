#!/bin/bash
# THE STANDING REGRESSION SET — 35 entries, stamp-audit LAST (rulings 38/48
# count discipline: this committed script IS the enumeration; a sweep total is
# never restated without it). Run against a SCRATCH database only — the gates
# refuse Railway URLs themselves, and several provision + tear down fixtures.
#
#   DATABASE_URL=postgresql://...scratch PAYMENT_TOKEN_ENC_KEY=... scripts/regress.sh
cd "$(dirname "$0")/.." || exit 1
if [ -z "$DATABASE_URL" ]; then echo "DATABASE_URL required (scratch DB)"; exit 1; fi
LOGDIR="${REGRESS_LOGDIR:-/tmp/regress-logs}"
mkdir -p "$LOGDIR"
run() {
  local name="$1"; shift
  if "$@" > "$LOGDIR/$name.log" 2>&1; then
    echo "PASS $name :: $(grep -Eo '[0-9]+/[0-9]+|ALL CHECKS PASS|PASS' "$LOGDIR/$name.log" | tail -1)"
  else
    echo "FAIL $name (exit $?) — see $LOGDIR/$name.log"
  fi
}
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
run gate-hygiene         npx tsx audits/gate-hygiene-verify.ts
run stamp-audit          npx tsx audits/tenant-stamp-audit.ts
echo "=== REGRESSION RUN COMPLETE ==="
