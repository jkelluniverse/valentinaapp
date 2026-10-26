# P6-SQUARE-TENANT-OAUTH

Header: P6 · platform split, final phase · depends-on P1–P5 · **sequenced AFTER P5, and
deliberately last and slowest — this is the one with live money in it** · 2026-09-17.
Dispatched as PLAN ONLY; nothing in this spec has been built or verified.

## WHY

Square is per-practice payments via OAuth by design, but tenant #1 runs on
platform-level environment variables holding VALENTINA'S merchant credentials. A second
practice cannot take payment, and the platform has no Square identity of its own. This
is the payments instance of the default-tenant defect (rulings 86 and 100) — her
practice standing in for the platform, the same sentence as every other defect found
this week. The A1 census already found the symptom: `lib/payments/account.ts:41` honors
a legacy token only for the default tenant.

## THE DISTINCTION THIS SPEC TURNS ON

Some Square credentials are legitimately PLATFORM-level and some are MERCHANT-level.
They are currently mixed in one env block. **Classification of every Square variable
present in production (read live from the Railway variable list, 2026-09-17 — names
only, values redacted by the connector):**

| Variable | Level | Disposition |
| --- | --- | --- |
| `SQUARE_APPLICATION_ID` | **PLATFORM** — the OAuth application practitioners connect THROUGH | Stays an env var; its VALUE must become Psychefolio's developer app, not Valentina's |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | **PLATFORM** — same identifier, exposed to the browser for the Web Payments SDK | Stays env; same value change. See A2 — `NEXT_PUBLIC_*` is a build-time inline |
| `SQUARE_ENVIRONMENT` | **PLATFORM** — sandbox vs production selector | Stays env, unchanged |
| `SQUARE_ACCESS_TOKEN` | **MERCHANT** — identifies ONE merchant | Moves to tenant data, obtained by OAuth, encrypted at rest, refreshed on schedule |
| `SQUARE_LOCATION_ID` | **MERCHANT** — one merchant's location | Moves to tenant data |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | **MERCHANT**, and the structural problem | Cannot survive as a build-time variable — see A2; the payment form must receive it at runtime |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | **UNRESOLVED — do not assume** | See A3; classification is part of A3's verification, not a premise |

**Two absences the classification found, both of which bear on the assumptions below.
Stated as observations, NOT as answers:**

1. **There is no Square application SECRET variable in production** — no
   `SQUARE_APPLICATION_SECRET`, `SQUARE_CLIENT_SECRET` or equivalent appears in the
   list. An OAuth authorization-code exchange requires one. This is evidence bearing on
   **A1** (is the connect flow operational, or merely present in code?) and must be
   resolved there rather than assumed either way — the code may name it differently, or
   the flow may exist and simply be unconfigured.
2. **`PAYMENT_TOKEN_ENC_KEY` is NOT in the production variable list**, though the gates
   require it. If the production application genuinely lacks it, whatever depends on it
   may be inert in production — which would materially change **A4**'s answer about
   what card-on-file data actually exists. Fold this into A4's enumeration.

## ASSUMPTIONS TO VERIFY, NOT TRUST — the Architect's, not facts

  A1. An OAuth connect flow already exists and works, and Valentina is on a legacy path
      beside it, rather than there being no path at all. **If the flow is unbuilt or
      half-built, say so plainly — that changes this from a migration into a build**,
      and the build order below is wrong as written.
  A2. `NEXT_PUBLIC_SQUARE_APPLICATION_ID` and `NEXT_PUBLIC_SQUARE_LOCATION_ID` are baked
      into the client bundle at BUILD time. If so, a per-tenant location id cannot come
      from a build-time variable at all and the payment form must receive it at runtime.
      **This is the load-bearing structural question** — the shape of step 2 depends on
      the answer.
  A3. `SQUARE_WEBHOOK_SIGNATURE_KEY` is one platform-wide key. Verify how Square signs
      and routes webhooks per connected merchant, **how the handler will know WHICH
      tenant a webhook belongs to**, and whether signature validation becomes
      per-tenant. A webhook that cannot be attributed to a tenant is a money-integrity
      defect, not a routing inconvenience.
  A4. Valentina has LIVE payment history, connected customers, and possibly card-on-file.
      ENUMERATE what exists — `SquareCustomerLink`, `ConnectedPayment`, `Charge`,
      `Payment`, `ExternalPayment` rows. **Whether a token swap invalidates any stored
      customer or card reference is the question that decides whether this is safe at
      all.** Note: production row counts require Jacob running read-only SQL in the
      Railway Query tab (rulings 73/75) — plan that round trip into the dispatch rather
      than discovering it mid-build, as the rehearsal had to.
  A5. The statement descriptor is set per-merchant in Square, not by our code. Verify.
      This program's most expensive lesson was twelve chargebacks totalling $5,400 filed
      as "no knowledge" because a descriptor read VIIIV CORPORATION. **If any code path
      influences the descriptor, it is in scope for this spec.**

**When to verify:** at DISPATCH, not now. P3, P4 and P5 rewrite the tenancy, identity
and scoping code these answers depend on, so findings gathered today would be stale by
the time P6 starts. The classification above is included because it was asked for and
because it reads env-var NAMES, which those phases do not change.

## STANDING LAWS

Money integrity (law 9) — append-only ledgers, fees config-driven, never hardcoded.
PCI — no PAN/CVV ever touches us; instruments live in Square. Attributable audit
(law 6) on every credential change: connect, refresh, disconnect and failure each write
an audit row naming actor and tenant, metadata only, never a token fragment. Server-side
enforcement (law 5). Merchant tokens are credentials and are encrypted at rest — never
logged, never echoed into a report, never returned to a client.

## NON-NEGOTIABLE

**Valentina takes real money from real clients.** She must be able to charge throughout,
and no stored customer or card reference may be orphaned. If the design cannot guarantee
that, the honest answer is to say so rather than to propose a cutover with a gap in it.

## BUILD ORDER (proposed — revise if the assumptions come back differently)

  1. **Platform Square developer account exists.** Application id/secret become PLATFORM
     credentials. Jacob creates the account; name exactly what he must produce
     (application id, application secret, the OAuth redirect URL to register, and which
     environment) and what he must NOT do (touch Valentina's merchant account).
  2. **Merchant credentials move to tenant data**, with OAuth connect + refresh. The
     read path prefers tenant data and falls back to the legacy env, **exactly the shape
     P1 used with TenantDomain — net behavior change zero at this step**, proven the
     same way.
  3. **Valentina reconnects HER OWN Square** through the OAuth flow, producing a
     tenant-level token; her connection becomes ordinary data. This is a real action a
     real person takes in a window she agrees to — plan it, do not assume it.
  4. **Remove the legacy env fallback.** Keystone, same shape as P3.
  5. **Webhooks attributed per tenant**, per A3's findings.

## VERIFY (sketch — the full list is written after the assumptions land)

  V-a. Valentina can charge, before and after every step — proven against Square sandbox
       or a real low-value transaction she agrees to, never by reading code.
  V-b. A SECOND practice can connect Square and charge. Nothing proves this but doing
       it. **SEQUENCING CONFLICT, flagged now rather than discovered later:** the
       obvious candidate is psf-rehearsal, but the queue currently schedules its
       teardown (Blocks 2/3) after P5 and BEFORE P6 — so the reference tenant would be
       gone exactly when this item needs it. Resolve at dispatch: either hold
       psf-rehearsal until P6 completes, or mint a fresh throwaway for P6 under the same
       C1/C2/C3 conditions. The Architect's call, not the builder's.
  V-c. No stored customer/card reference orphaned — counts before and after.
  V-d. Webhooks attributed to the correct tenant, proven with a real delivery.
  V-e. Cross-tenant: practice A cannot charge through practice B's connection, asserted
       server-side.
  V-f. Standing set green, stamp-audit LAST, exit 0 — and per ruling 92 that exit code
       means the harness-guard ran, not that a script reported a number about itself.

## OUT OF SCOPE

Stripe (platform subscriptions, untouched), pricing, fee changes, and anything that
alters what Valentina's clients are charged.
