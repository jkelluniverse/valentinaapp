# Incident audit — scoped-client `$transaction([...])` array-form bug

**Window:** from the scoped-client deploy (`e83d93e`) to the fix (`26e5a90`).
**Fault:** the tenant-scoped Prisma client's array-form `$transaction([...])`
awaited each built op, executing the `PrismaPromise` into a resolved value
instead of passing the unresolved promise to `$transaction`. Every array-form
transaction threw `"All elements need to be Prisma Client promises."`

## Integrity conclusion: NO data corruption occurred

The error is thrown **synchronously by Prisma's array validator, before any
op in the array executes** (confirmed by the stack trace: the throw is inside
`_transactionWithArray`'s `.map`, prior to execution). So every affected
transaction was an **atomic clean-fail** — none of its writes landed. The only
way to corrupt data would be a *non-transaction* write executed **earlier in
the same action**, leaving it inconsistent with the failed transaction.

Every array-form site was audited for pre-transaction writes:

| Action | Pre-tx writes? | Effect during window |
|---|---|---|
| `library setIntakeWorksheet` | none | intake-worksheet toggle failed cleanly |
| `library deletePrompt` / `deleteWorksheetEverywhere` | none | delete failed cleanly; item remained |
| `folder trashFolder` / `restoreFolder` | none | trash/restore failed cleanly |
| `notes assignPromptFromNote` / `assignWorksheetFromNote` | none | assignment + status-bump both no-op'd (consistent) |
| `billing matchExternalPayment` | none (reads only) | manual payment-match no-op'd; **no money moved, charge stayed DUE/PENDING, external payment stayed unmatched** |
| `courses deleteCourse` / `moveChapter` / `moveLesson` | none | delete/reorder failed cleanly |
| `forgot resetPassword` | none | password unchanged, token not consumed (retryable) |
| `human-design ensureChart` | one: geocode-backfill (`clientProfile.update` of lat/lng/tz), condition-guarded | profile got coords, chart deferred — **consistent partial, self-heals on next `ensureChart`** |

**Only one action had a pre-transaction write** (`ensureChart`'s geocode
backfill), and it leaves a consistent state (coordinates saved, chart
computed on the next call). No half-written records anywhere.

## Financial integrity: intact

- The money-critical transactions — **session-credit consumption on
  appointment completion** and **package activation on charge** (`lib/packages.ts`)
  — use the **function form** `$transaction(async (tx) => …)`, a different code
  path that was **never affected** by this bug. The credit ledger was never at
  risk.
- The one billing array-tx (`matchExternalPayment`) only links metadata
  (`matchedChargeId`) and marks a charge PAID; it failed atomically, so no
  charge was half-updated. Actual card charges go through the Square API in
  single-write actions, unaffected.
- Auto-reconciliation in the nightly tick uses a **single** `externalPayment.update`
  (not array form), so it worked throughout; only the manual "match" button was
  affected.

## Impact was availability, not integrity

Affected actions **errored or silently no-op'd** for the user during the
window; none corrupted data. Deferred effects, all self-healing:

- **Charts:** a client who onboarded or changed birth data during the window
  would not get a (re)computed chart until their next `/space/design` visit or
  profile save — which now works (proven by `complete-verify`, chart computed
  16/16). No stale data is *wrong*; it's just not-yet-updated, and recomputes
  automatically.
- **Password resets:** reset emails were sent (single-write, worked) but
  clicking through to set the new password failed; users can retry now with a
  fresh request.
- **Library/course edits, deletes, reorders, manual payment matches:** any that
  were attempted simply didn't take effect; the user re-does them now. No
  cleanup required because nothing was half-applied.

## Actions

- ✅ Code fixed (`26e5a90`); `complete-verify` permanently guards the array path.
- ✅ Write-path smoke suite added so a mutation regression can't hide behind
  GET-only smoke again (`scripts/smoke-writes.ts`).
- No data remediation required: the audit found no corrupt or half-written
  records. Deferred chart recomputes self-heal on next visit; blocked user
  actions are simply retried.
