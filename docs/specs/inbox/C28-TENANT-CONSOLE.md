# C28-TENANT-CONSOLE — somewhere to see the practices that exist

**Spec:** C28-TENANT-CONSOLE · **Depends-on:** PLATFORM Phases 0–5, C23-CAPTURE (`/admin/prospects` and its `PLATFORM_ADMIN_EMAILS` gate), C25
**Priority:** medium, but cheap and operationally overdue. Useful on September 23; not a blocker for it.
**Architect:** decided 2026-09-12.

## Why this exists

Today the entire cross-practice management surface is **one page that creates a tenant**:

```
app/admin/tenants/new/page.tsx      ← create
app/admin/prospects/…               ← leads, counts, CSV, QR
```

There is no tenant list, no tenant detail, and no way to change a practice after it is created. Once a
practitioner signs themselves up, the only ways to see or alter their account are
`scripts/provision-tenant.ts` (which only creates) and direct database access.

That is survivable with one practice. On September 23 the platform starts minting practices from a public
form, and the operator's questions become immediate and ordinary: *who signed up? is their practice actually
set up? what plan are they on? why can't they log in? how do I suspend one?* Those should not require a
database client.

## The constraint that defines this build

**The console shows ACCOUNTS. It must never show CLIENT RECORDS.**

This platform holds practitioners' clients' reflections, session notes, transcripts and psyche maps. A
platform-admin surface that can read across practices would be a backdoor through the cross-practice wall —
the most security-critical boundary in the codebase — and it would make every privacy claim the product
makes untrue. The honest-data-posture law (#8) says we do not imply protections we do not offer; the
converse obligation is that we do not quietly build the capability to violate them.

So: tenant metadata, billing state, module configuration, practitioner account status, counts. **Never a
client's name, never a note, never a reflection, never a transcript, never a psyche node** — not even
counts that would reveal a specific client's activity. If a support question genuinely needs client-level
data, the answer is the existing AMD-06 assist path with its consent and audit trail, not this console.

## Assumptions to verify, not trust

*(Ruling 18.)*

1. `app/admin/tenants/new/page.tsx` and `lib/platform-admin.ts` establish the gating pattern —
   `PLATFORM_ADMIN_EMAILS` allowlist, 404 for everyone else, **no new role**. Confirm and follow it exactly.
2. A practice's state is spread across `Tenant` (identity, slug, status, layout, skin, branding,
   featureFlags), `TenantModule` (enabled modules and their labels), `TenantBilling` (plan and status), the
   practitioner `User` row, and per-practice `PracticeSetting` rows. **Verify this list is complete** before
   building a detail page that claims to show a practice.
3. `Tenant.status` already supports `ACTIVE | DEMO | PROVISIONING | SUSPENDED`, so suspend/reactivate is a
   status change rather than new schema.
4. `PractitionerProspect.tenantId` links a signup back to the prospect it came from, so a tenant can be
   traced to its lead and referral code.
5. Reading `PracticeSetting` rows for another tenant from an admin page requires a deliberate cross-tenant
   read. **Determine how** — the scoped client will not do it by design, and the answer must be an
   explicit, allowlisted, audited path rather than a convenient raw query sprinkled into a page.

## Standing laws this build must honor

- **Server-side enforcement (law #5)** — the allowlist gate is enforced server-side on every route,
  including any data route. UI hiding is not security.
- **Attributable audit (law #6)** — every state change writes an `AuditEvent` with the acting admin.
  Metadata only.
- **Consent precedes capability (law #3)** — nothing here creates a path to client data.
- **Bilingual parity (law #7)** — this is an internal operator surface for Jacob. English-only is
  acceptable **if** stated plainly in the report; do not silently skip it.

## Build order

### 1. `/admin/tenants` — the list

Every practice, newest first: slug (linked to its portal host), display name, status, plan, practitioner
name and email, module count, created date, and — if it came from a signup — its source and referral code.
Counts by status at the top. Filter by status, search by slug/name/practitioner email.

This is the page that answers "who signed up at the event?" in one look.

### 2. `/admin/tenants/[id]` — the detail

Identity and branding, module list with labels and positions, billing plan and status, the practitioner's
account state (active, forced-password-change pending, last sign-in if available), the practice's own
`PracticeSetting` rows (keys and values — configuration, not client data), and the prospect/referral trail.

Read-only except for the narrow actions below.

### 3. The narrow write surface

Only what an operator genuinely needs on the day, each audited and each confirmed before it fires:

- **Suspend / reactivate** (`Tenant.status`) — state clearly what suspension does to the practitioner's
  ability to sign in, and make it reversible.
- **Reissue the practitioner's temporary password**, reusing the existing provisioning path and its
  forced-change behaviour. This is the realistic support request on day one ("I can't log in").

Deliberately **not** included: editing branding, editing modules, changing plans, deleting a tenant. Each is
a real decision with real consequences, and none is needed on September 23. Deleting a practice in
particular should never be a button on a list page.

### 4. Reachability

Link `/admin/tenants` and `/admin/prospects` to each other. They are the two halves of the same question —
who is interested, and who actually became a practice.

## Verify (this list is the gate — evidence required per item)

Write `audits/tenant-console-verify.ts` in house style, self-cleaning:

1. Each of the five assumptions confirmed or corrected in writing.
2. The list renders for an allowlisted admin and **404s for a signed-in non-allowlisted practitioner**, a
   signed-in client, and (redirects) a signed-out visitor. Same for the detail page and any data route.
3. Seeded practices appear with correct status, plan, module count and practitioner; counts match; filter
   and search return the right rows.
4. The detail page shows a practice's configuration correctly, including its `PracticeSetting` rows.
5. **The client-data wall: assert that no client name, reflection, note, transcript or psyche content
   appears in the rendered HTML of either page**, with a seeded practice that has fixture clients. This is
   the check that matters most — write it so it would fail loudly if someone later adds a "recent activity"
   widget that reaches into client data.
6. Suspend changes status, is reversible, writes an `AuditEvent` naming the acting admin, and its stated
   effect on sign-in actually happens.
7. Reissuing a temporary password produces a working credential with forced change on first use, and writes
   an audit row containing no password material.
8. A cross-tenant read performed by the console is explicit and allowlisted — `guard-prisma` stays clean,
   and the allowlist entry carries a justification in `docs/PRISMA-ALLOWLIST.md`.
9. Regression, non-negotiable: `lint:wall` · `guard-prisma` · `tsc` · `build` · `smoke` · `smoke:writes` ·
   signup **37/37** · capture **59/59** · referral **68/68** · engage **172/172** · tenant-scope **48/48** ·
   nested-stamp **43/43** · settings-i18n **10/10** · practice-setting **47/47** · platform phase2 **16/16**,
   phase3 **11/11**, phase5 **17/17** + verify · c21 **58/58** · c20 **28/28** · v31 **32/32** · c12x ·
   onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset · amd06 · stamp audit **exit 0** last.

## Out of scope (do not build)

Any path to client records · deleting tenants · editing branding, modules or plans · impersonation (AMD-06
assist already exists, with consent and audit) · a new admin role · analytics or usage dashboards ·
multi-admin permissions.
