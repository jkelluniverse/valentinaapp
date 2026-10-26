# SQUARE / CALLBACK TRAFFIC — observed, not inferred. Nothing changed.

## The traffic table (production, last 7 days, all statuses)

| Endpoint | Requests | Result |
| --- | --- | --- |
| `/api/jobs/tick` | **673** | all 2xx — LIVE, every 15 min (96/day) |
| `/api/square/webhook` | **24** | all 2xx — LIVE, real money events |
| `/api/webhooks/square` | **0** | never called |
| `/api/webhooks/transcription` | **0** | never called |
| `/api/recording/webhook` | **0** | never called |
| `/api/inbound/remarkable` | **0** | never called |

Instrument proven working in the same window (ruling 110): `/api/tenant-kind` returned
57 requests through the identical query.

**Ruling 114's exemption list shrinks from FIVE to TWO** — `/api/square/webhook` and
`/api/jobs/tick`. The other three need no transitional exemption; they need the
payload-resolution pattern built correctly whenever they are actually wired up.

## Q1 — what writes ExternalPayment: exactly ONE create path, and it is the webhook

Every write site in the repository:

| Site | Operation |
| --- | --- |
| `app/api/square/webhook/route.ts:154` | **`upsert`** — the only path that CREATES |
| `app/practitioner/billing/actions.ts:394` | `updateMany` — matching/dismissing |
| `app/practitioner/billing/actions.ts:428` | `update` — matching |
| `app/api/jobs/tick/route.ts:374` | `update` — reconciliation |

**So all 25 rows were written by Square webhooks through endpoint A.** No manual entry,
no invoice flow, no practitioner action creates them.

**And this explains Charge = 0 while ExternalPayment = 25 — the two facts are the same
fact.** Endpoint A tries, in order: match the payment to a Charge by `reference_id`,
then by `squareInvoiceId`, then by `squarePaymentId`. `Charge` is empty, so every
lookup misses and every event falls through to the final branch — the
`externalPayment.upsert` whose own comment reads *"An outside-the-app payment — surface
it for one-tap matching."* That is the endpoint's documented third job, working exactly
as designed for a practitioner who invoices and takes payment **inside Square** rather
than through the app's own charge flow. The 25 rows are the accumulated record of her
doing precisely that.

**Answer to the plain question: yes — the 25 ExternalPayment rows have everything to do
with Square webhooks. They are its only source.**

## THE CONTRADICTION, and what it means

The dashboard Jacob opened shows **zero** webhook subscriptions, yet **signature-verified
events are arriving**. Endpoint A returns **401 on signature failure** and only logs a
parsed event after verification passes — and the logs show parsed events
(`[square-webhook] invoice.payment_made … status=PAID`) with 2xx responses. So the
signature verified against the `SQUARE_WEBHOOK_SIGNATURE_KEY` in our production env.

**Therefore a subscription exists in a DIFFERENT Square application or account — the one
that issued that signing key.** The "practitioner portal" app
(`sq0idp-T4siHrz83o93QxqJt80h9g`) is not the wired-in one. That is Q2 of the previous
dispatch answered: **yes, different application; Jacob is looking at the wrong dashboard.**

**Q1 of that dispatch cannot be answered the way it was scoped:**
`NEXT_PUBLIC_SQUARE_APPLICATION_ID` is referenced **nowhere in the codebase** (repo-wide
grep, zero hits). Next.js only inlines `NEXT_PUBLIC_*` variables that appear in source,
so the value never reaches the client bundle and there is no `sq0idp-` to grep for. The
variable is vestigial; the app talks to Square purely server-side via
`SQUARE_ACCESS_TOKEN`. **For P6's classification that is a useful finding in itself: one
of the two "platform-level" variables is dead weight.**

**How Jacob finds the right account:** in the Square Developer Dashboard, the account may
hold SEVERAL applications — use the application switcher and check **each** one's
**Webhooks → Subscriptions** on the **Production** tab, looking for a Notification URL
ending `/api/square/webhook`. If no application in that account has it, the subscription
belongs to a different Square login entirely — likely Valentina's own merchant account
rather than Jacob's developer account, which would fit a setup where her credentials were
pasted into the env.

## Q2 — WebhookEvent: DO NOT record drift yet. The simpler explanation is untested.

`WebhookEvent` **is** in `prisma/schema.prisma` (line 1586) **and** migration
`37_billing_b1` creates it:

```sql
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    ...
```

So it should exist in production. Two candidate explanations for "relation does not
exist", and they are very different findings:

- **(a) Schema drift** — migration 37 never applied. **Unlikely**: `npx prisma migrate
  deploy` is the service's `preDeployCommand` and runs on EVERY deploy; roughly ten
  deploys succeeded today alone. A pending migration would have been applied; a failing
  one would have failed the deploy.
- **(b) An unquoted identifier** — Postgres folds unquoted `WebhookEvent` to
  `webhookevent`, which does not exist. Every table in this codebase is created with
  quoted CamelCase names, so an unquoted query CANNOT find any of them. My census SQL
  quoted every name; a hand-typed query may not have.

**(b) is far more likely, and declaring drift before testing it would be exactly the
error this program keeps catching.** One quoted, single-statement query settles it — it
reports the table's existence AND the migration ledger together:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'WebhookEvent') AS webhookevent_table_exists,
  (SELECT count(*) FROM "_prisma_migrations"
     WHERE migration_name LIKE '%billing_b1%' AND finished_at IS NOT NULL) AS migration_37_applied,
  (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL) AS migrations_unfinished,
  (SELECT count(*) FROM "_prisma_migrations") AS migrations_total;
```

**EXPECTED if (b):** `webhookevent_table_exists 1 · migration_37_applied 1 ·
migrations_unfinished 0` — the table is there and the earlier query was simply unquoted.
**If `webhookevent_table_exists 0` with `migration_37_applied 1`**, that is real drift on
a money surface and, per ruling 118, it outranks P3.3.

Ruling 118's substance holds regardless, and is worth keeping: a table missing from
production is invisible to every gate, because gates build their scratch DB from the
same migrations that production supposedly ran.

**Also reconciled:** `WebhookEvent` was correctly absent from the 79-model census. It is
deliberately UNSCOPED — `lib/tenancy/scope.ts` names it: *"webhookEvent (platform-level,
like Tenant/TenantModule): provider event ids are global idempotency keys across all
tenants."* So the census was complete; the model is not scoped, not missing.

## Q3 — ConnectedPaymentAccount = 0: P6's premise, established as fact

Confirmed. There is **no OAuth connection for any tenant**. Valentina's payments run
entirely through the legacy env-var path (`SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID`),
which is what `lib/payments/account.ts:41`'s `env-legacy` branch exists to serve.

Consequence for endpoint B: with zero rows, its `merchant_id → tenantId` lookup could
never attribute an event even if one arrived — and none does. **B is unbuilt-in-practice:
correct code, no subscription, no account rows, and (see Q2) a table it depends on whose
presence in production is currently unconfirmed.**

## Ruling 117 applied — the distinction, per endpoint

- `/api/square/webhook` — **a working integration**, in its degraded-but-designed mode
  (no Charges to match, so everything lands as ExternalPayment). Not unbuilt.
- `/api/webhooks/square` — **an unbuilt integration**: never subscribed, no account rows,
  dependent table unconfirmed. Remediation is a BUILD (P6), not a fix.
- transcription / recording / remarkable — **unbuilt in production**: zero traffic.
  Whether they are wired in their vendor dashboards is still worth Jacob confirming, but
  no live traffic reaches them.
