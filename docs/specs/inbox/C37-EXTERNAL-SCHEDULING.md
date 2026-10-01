# C37-EXTERNAL-SCHEDULING — embed AND sync

**SPEC ONLY. NOTHING BUILT.** Ratification precedes any code.

The practitioner keeps Calendly or Acuity; the platform keeps knowing. A booking
Psychefolio cannot see is a hole in the context layer, and context is the product.

---

## 0. THE ASSUMPTIONS, VERIFIED — AND ONE IS A BLOCKER FOR ONE PROVIDER

### A1 — PLAN REQUIREMENTS. Confirmed, and worse than assumed for Acuity.

| provider | webhooks require | source |
|---|---|---|
| **Calendly** | a **paid** plan — **Standard, Teams or Enterprise**. Free cannot use webhooks. | Calendly developer FAQ |
| **Acuity** | **the top tier only** — "Powerhouse", renamed **Premium** in early 2026 (~$61/mo). Starter and Standard have **no API access at all**. | Acuity pricing/API docs |

> **⛔ JACOB MUST KNOW THIS BEFORE HE PROMISES ANYTHING.** If Valentina is on
> Calendly's free tier, **the embed works and the sync does not**. There is no
> partial sync and no workaround: no paid plan, no webhook. The same is true, and
> more expensive, for an Acuity practitioner below Premium.
>
> This is a commercial precondition, not an engineering one. **The settings screen
> must say it in plain words before a practitioner tries and fails.**

### A2 — CONFIRMED. `Appointment` holds an external booking additively.

`Appointment` already carries `tenantId`, `practitionerId`, nullable `clientId`,
`kind`, `startAt`/`endAt`, `status`, `location`, `bookedBy`, `clientNote`.
Additive columns only — **nothing altered, nothing retyped, nothing dropped**:

```prisma
externalProvider  String?   // "calendly" | "acuity"
externalId        String?   // the provider's own event/appointment id
externalPayload   Json?     // raw body as delivered — evidence of what we were told
externalUpdatedAt DateTime?
@@unique([externalProvider, externalId])   // reconciliation key + duplicate guard
```

The unique pair is the reconciliation key: a reschedule updates the row it
already has instead of creating a second one.

### A3 — CONFIRMED WRONG IN THE USEFUL DIRECTION. `Lead` is nearly it.

`Lead` already holds `name`, `email`, `phone`, `note`, `status`, `source`,
`convertedUserId`, and `appointmentId @unique` relating to a **discovery**
appointment. It exists precisely to be *a person who is not yet a client*.

**Ruling 193 needs no new model.** It needs `Lead` plus one additive column:

```prisma
intakeAnswers Json?   // what the invitee typed into the provider's own questions
```

**`Lead` already satisfies ruling 193's hard part:** a Lead is not a
`ClientProfile`, so a stranger filling in a Calendly form **cannot manufacture a
client record**. Promotion stays exactly what it is today — `convertedUserId`,
set when the practitioner invites them.

**The evidence boundary is the sharper half, and it is NOT structural.** Storing
`intakeAnswers` on a Lead does not make it citable; something must *refuse* to
cite it. **The spec's obligation: name the read path the AI uses and assert that
it excludes `Lead.intakeAnswers` until promotion, with a gate.** A comment is not
a boundary. This is the modality-data shape, and law 2's evidence-mandatory rule
is the reason.

### A4 — ⛔ THE PROVIDERS DIFFER, AND THIS IS THE FINDING THAT SHAPES THE BUILD

**Calendly — a single fixed URL works. Fully ruling-195 compliant.**
Each subscription is created *by that practitioner's own token*, has its own
`signing_key`, and the payload carries the owning **user / organization URI**. So:
payload → connection → that connection's signing key → verify. **Tenant comes
from the payload. The host is never consulted.**

**Acuity — the payload CANNOT identify the tenant.** Verified: the body contains
only `action`, `id`, `calendarID`, `appointmentTypeID`. **There is no account or
user id.** `calendarID` is account-scoped and may collide across accounts. And
the signature is HMAC-SHA256 over the body **using that account's own API key** —
so you need the tenant to verify, and the payload cannot tell you the tenant.
**A chicken-and-egg that a single shared URL cannot break.**

Two escapes, and **I am not choosing between them unilaterally** because the
first one touches ruling 195:

- **(a) A per-connection URL PATH** — `/api/webhooks/acuity/<opaque-token>`.
  Acuity's dynamic webhook API lets each account register its own target, so
  every practitioner registers their own path. The token selects the connection;
  the signature then proves authenticity with that connection's key.
  **THE TENSION, NAMED:** ruling 195 says attribution comes from the payload,
  never the request host. A path is not a host — and the thing that broke
  Square's callback was a *single global* URL that could only ever name one
  tenant, which this is not, because each practitioner registers their own.
  But it is still "the URL tells us who", so **it is the Architect's call, not
  mine.** *Recommended.*
- **(b) Trial-verify against every connected Acuity key** — compute the HMAC once
  per connected account until one matches. Strictly payload-and-signature only,
  so ruling 195 holds literally. Cost is O(connections) HMACs per delivery:
  free at ten practices, wrong at a thousand.

**Calendly gets (a)'s benefit for nothing and should use the single shared URL
either way.** The seam must therefore allow *per-provider* ingress shapes — which
is the honest answer to ruling 192's "design so a third can be added".

### A5 — WHAT A PRACTITIONER ACTUALLY DOES. This decides the UI.

| provider | auth | what they do |
|---|---|---|
| **Calendly** | OAuth **or** a Personal Access Token | **PAT: paste one value.** OAuth needs a registered app + redirect — and that is the Square blocker's neighbourhood, so **v1 uses a PAT.** |
| **Acuity** | HTTP Basic (User ID + API Key); OAuth2 exists for multi-account | **Paste two values** (User ID, API Key). OAuth2 deferred for the same reason. |

**Consequence: v1 needs no OAuth flow at all.** Two paste-a-key forms, one
"Test connection" button. That is a small settings screen, not a subsystem —
and it sidesteps the per-account-callback problem that blocks Square.

### A6 — CONFIRMED, AND YOUR PREFERENCE IS THE RIGHT MODEL.

The built-in booking flow, `AvailabilityRule`, `SchedulingConfig` and `/book` are
**untouched**. External scheduling is **per-practice choice, built-in remains the
default** (ruling 194: off by default, nothing changes for a practitioner who
connects nothing). A practice choosing "embed" replaces what `/book` *renders*;
it does not delete availability rules, so **disconnecting restores the built-in
page with its configuration intact.**

---

## 1. THE MODEL

```prisma
model ExternalSchedulingConnection {
  tenantId      String?   // scope column, like every tenant-scoped model
  id            String    @id @default(cuid())
  provider      String    // "calendly" | "acuity"
  status        String    // CONNECTED | NEEDS_ATTENTION | DISCONNECTED
  externalOwner String?   // Calendly user/organization URI; Acuity user id
  credentialEnc String    // AES-256-GCM, PAYMENT_TOKEN_ENC_KEY's discipline
  signingKeyEnc String?   // Calendly's per-subscription signing key
  ingressToken  String?   @unique  // A4(a), Acuity only
  embedUrl      String?   // what /book renders when this practice embeds
  lastEventAt   DateTime?
  lastErrorAt   DateTime?
  lastError     String?
  createdAt     DateTime  @default(now())
  @@unique([tenantId, provider])
}
```

**Credential encryption reuses the payments discipline, and inherits its
warning verbatim: the key must never change once credentials exist**, or every
connection becomes unreadable and every practitioner must reconnect.

---

## 2. INGRESS, AND WHY IT IS SHAPED LIKE THE STRIPE ONE

**Ruling 195's working precedent in this codebase is `lib/billing/lifecycle.ts`**,
and C37 copies it deliberately:

```ts
// tenant = the event's Stripe customer id, never the request host
const row = await rawPrisma.tenantBilling.findUnique({ where: { stripeCustomerId: customerId } });
if (!row) return { status: 200, note: "ignored (unmatched customer)" };
```

**Unmatched → acknowledged and dropped, never guessed into a tenant.** C37 does
the same with `externalOwner` (Calendly) or `ingressToken` (Acuity).

This is the opposite of Square's OAuth callback, which resolves the tenant from
the callback host and therefore works for exactly one tenant. **That contrast
belongs in the code comment so the next person does not re-derive it.**

### Idempotency — the existing lock, unchanged

`WebhookEvent` already exists with `id` (provider event id) + `layer`, and
`lib/payments/webhook.ts` shows the contract: **the unique create IS the claim**,
a duplicate loses the race and returns 200, and a processing failure **deletes
the row** so the provider's retry can reprocess rather than being swallowed
forever as a duplicate. C37 adds `layer: "calendly" | "acuity"` and nothing else.

**Acuity has no event id** — only `action` + `id`. The idempotency key must
therefore be synthesised: `acuity:<connectionId>:<action>:<id>:<occurredAt>`.
**State this rather than assume the provider gives us one**, because a
reschedule and a cancel share the appointment `id` and would otherwise collide.

---

## 3. RECONCILIATION — not just creations

| provider event | effect |
|---|---|
| scheduled / invitee.created | upsert `Appointment` by `(provider, externalId)`; upsert `Lead` by email within the tenant |
| rescheduled | **update the existing row's** `startAt`/`endAt` — never a second appointment |
| canceled / invitee.canceled | `status = CANCELED`; the row is **kept**, because a cancellation is context |
| changed | update the mutable fields from the payload |

**A booking that moves in Calendly must move in Psychefolio, or the context layer
lies.** The `@@unique([externalProvider, externalId])` pair is what makes that a
guarantee rather than a hope.

---

## 4. BACKFILL, DISCONNECT, AND FAILURE VISIBILITY

**Backfill: YES, future bookings only, on connect, and say so on screen.** Both
providers expose list endpoints. Past bookings are excluded because they would
manufacture history nobody reviewed; future ones are imported because otherwise
the first weeks of the calendar are silently wrong — the exact hole this exists
to close.

**Disconnect: synced appointments REMAIN.** They are the practice's record of
what happened. The connection goes `DISCONNECTED`, the webhook is deleted at the
provider, credentials are erased, and **`/book` reverts to the built-in page with
its availability rules intact** (A6). Leads remain; they are people, not sync
artefacts.

**⛔ SILENT FAILURE IS THE REAL RISK. A dead connection looks exactly like a quiet
week.** So:

1. Every rejected delivery — bad signature, unknown owner, provider error —
   writes `lastErrorAt`/`lastError` on the connection.
2. **The tick checks for silence**: a `CONNECTED` connection with no
   `lastEventAt` inside its expected window flips to `NEEDS_ATTENTION`.
3. The settings screen shows **"Last booking received: …"** — a timestamp a human
   can judge, not a green dot that means "we believe so".
4. `NEEDS_ATTENTION` emails the practitioner. **A booking that vanishes must not
   be discovered by a client arriving for a session nobody recorded.**

---

## 5. VERIFICATION — what a gate can prove, and what it cannot

**Provable by gate** (scratch DB, fixture payloads, no provider account):
signature verification both directions; tenant resolution by payload, and the
refusal when the owner is unknown; idempotency — the same delivery twice yields
one appointment; reschedule updates rather than duplicates; cancel preserves the
row; **`Lead.intakeAnswers` is NOT reachable by the AI read path before
promotion** (the ruling-193 boundary, asserted, not commented); off-by-default —
a tenant with no connection sees byte-identical behaviour.

**NOT provable by gate — ruling 76, stated plainly rather than papered:** that
Calendly or Acuity actually deliver to the registered URL; that their live
signature matches our implementation; that the plan tier is sufficient; that
their payload shape matches the fixtures. **A gate cannot prove a deployment
seam.** These need a real paid account on each provider, and the honest position
is: **the integration is gate-proven and provider-unproven until someone connects
a live account.** Do not present fixture success as live-sync proof.

---

## 6. COST OF A THIRD PROVIDER (ruling 192)

The seam is: one `ExternalSchedulingConnection` row shape, one normalise step
(provider payload → `{ action, externalId, startAt, endAt, invitee }`), one
shared apply step. A third provider costs **a normaliser, a signature verifier,
a connect form, and an ingress route** — provided it can identify its tenant.
**If it cannot, it costs whatever A4(a) costs, and that is the question to ask
first about any new provider**, before any of the rest.

---

## 7. OUT OF SCOPE

Stripe, Square, /founders, brand-web, tier demos, any third provider. **No
customer-facing copy mentions external scheduling until it exists and is
verified** — three features were cut for exactly that reason (ruling 188).

## 8. WHAT I NEED RULED BEFORE BUILDING

1. **A4's Acuity ingress: (a) per-connection URL path, or (b) trial-verify.**
   I recommend (a) and will not choose it alone, because it touches ruling 195.
2. **A1 is commercial, not technical** — Jacob should confirm Valentina's
   Calendly tier before this is promised to her.
3. **A3's evidence boundary**: confirm that naming and gating the AI read path is
   the right enforcement, rather than a separate store for unvetted material.
