# A1 RE-ENUMERATION — before P3.3. There is no third consumer; there are FIVE.

Read-only, run against current code after P3.1. The count was wrong once, so this
enumerates CONSUMERS of host-based tenant resolution rather than resolvers.

## The resolvers: still exactly two, both now mapping-first

`slugFromHost()` has exactly two callers in application code:
1. `lib/tenancy/index.ts:186` — `resolveTenant()`, the CHROME resolver (P1).
2. `lib/prisma.ts:139` — `requestTenantId()`, the DATA resolver (P3.1).

No third resolver exists. **But "how many resolvers" was the wrong question** — the
risk in P3.3 is not who resolves, it is **who DEPENDS on host resolution and is not a
browser**. Those callers never appear in a resolver census.

## FIVE external-callback consumers, none of them a browser

Each is an endpoint an EXTERNAL provider calls on a URL configured in that provider's
dashboard. Each does tenant-scoped database work through the scoped client, so its
tenant comes from `requestTenantId()` — i.e. from **the Host the provider happens to
call**. After P3.3, a callback arriving on an UNMAPPED host will refuse.

| Endpoint | Service | Scoped writes | Tenant comes from |
| --- | --- | --- | --- |
| `/api/square/webhook` | inline in the route | **5** (`Charge` ×3, `ExternalPayment`, `charge.updateMany`) | **HOST** ⚠️ money records |
| `/api/webhooks/transcription` | `lib/capture.ts` (`completeCapture`) | scoped client, no `withTenantScope` | **HOST** ⚠️ |
| `/api/recording/webhook` | `lib/recording.ts` (`ingestRecording`) | scoped client, no `withTenantScope` | **HOST** ⚠️ |
| `/api/inbound/remarkable` | `lib/remarkable.ts` (`ingestInboundEmail`) | scoped client, no `withTenantScope` | **HOST** ⚠️ |
| `/api/jobs/tick` | inline | **7** | **HOST** (A3 — no scheduler; whoever calls it) |

## The counter-example that shows the right pattern already exists

`/api/webhooks/square` → `lib/payments/webhook.ts` resolves tenant **from the payload,
not the host**: `merchant_id → ConnectedPaymentAccount.tenantId`, on the RAW client,
and its own comment states the rule — *"Events for merchants we don't hold a connection
for are acknowledged and dropped (never guessed into a tenant)."* That endpoint is
**host-independent and P3.3-safe by construction**.

**So there are TWO Square webhook endpoints with different tenancy models:**
`/api/webhooks/square` (payload-resolved, safe) and `/api/square/webhook` (host-resolved,
writes money records). Which one Square actually calls in production is set in Square's
dashboard and **cannot be read from here** — it needs Jacob, or P6's A3.

## What this means for P3.3 — a shape question, not a detail

P3.3 cannot simply remove the fallback and rely on browsers arriving on mapped hosts.
Every provider callback URL is a host chosen months ago in someone else's dashboard.
Three ways forward, and the choice is the Architect's:

- **(a) Confirm and map.** Enumerate each provider's configured callback URL (Square,
  the transcription provider, the recording provider, Resend inbound) and ensure each
  host has a `TenantDomain` row. Cheapest, but it makes correctness depend on four
  external dashboards staying as they are.
- **(b) Make callbacks payload-resolved**, following `lib/payments/webhook.ts`. The
  correct end state and the most work; arguably P6's for the Square half.
- **(c) Ship P3.3 with callbacks explicitly exempted** — a narrow, named allowlist of
  callback paths that keep host-pattern resolution until (b) lands. Honest, revertible,
  and it does not pretend the problem is solved.

**Whichever is chosen, ruling 112 applies to all five**: an unmapped callback must
THROW, never resolve to a tenant with zero rows and report success. `/api/jobs/tick`
already returns `ok:true` with `report.<step>="error"`, so its failure is quiet by
construction — that is the demonstration ruling 112 asks for.

## One test-apparatus consumer, named because A2 said not to relax a gate

`audits/platform/verify.ts` asserts the fallback's behavior directly:
`slugFromHost("valentinavelez.com") === "valentina"`,
`slugFromHost("portaldomain.com") === "valentina"`,
`slugFromHost("a.b.portaldomain.com") === "valentina"`. These encode the fallback as
correct. P3.3 must UPDATE these assertions to the new truth (unmapped → no practice),
not delete or relax them — and the gate's count moves, which per ruling 38 must be
named when it does.

## Nothing was built or changed

Holding for Jacob's two SQL outputs (P3.2).
