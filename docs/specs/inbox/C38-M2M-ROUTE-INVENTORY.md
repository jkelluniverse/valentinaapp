# C38-M2M-ROUTE-INVENTORY

**Status:** spec, for build immediately after C37's deploy verification.
**Origin:** ruling 201. Found while building C37, by asking whether the gate that
inventories unauthenticated routes could see C37's two new ones. It could not.

---

## 1. The defect

`audits/host-tenancy-verify.ts` exists to enforce ruling 113: a machine-to-machine
caller's tenancy must come from an authenticated payload, never from the Host
header. It does that by INVENTORYING every route under `app/api` that reaches
tenant-scoped data without a user session, and failing when an unclassified one
appears.

Its detector is:

```ts
const SCOPED_IMPORT = /from\s+"@\/lib\/(prisma|tenancy)"/;
```

That matches only **direct** importers. A route that reaches the database through
a service module is invisible to it. Nine do:

| route | reaches the DB via |
|---|---|
| `app/api/auth/[...nextauth]/route.ts` | `auth.ts` *(scoped)* |
| `app/api/inbound/remarkable/route.ts` | `lib/remarkable.ts` *(scoped)* |
| `app/api/recording/webhook/route.ts` | `lib/recording.ts` *(scoped)* |
| `app/api/signup/slug/route.ts` | `lib/signup.ts` **(raw)** |
| `app/api/webhooks/acuity/[token]/route.ts` | `lib/scheduling/external/ingress.ts` **(raw)** |
| `app/api/webhooks/calendly/route.ts` | `lib/scheduling/external/ingress.ts` **(raw)** |
| `app/api/webhooks/square/route.ts` | `lib/payments/webhook.ts` **(raw)** |
| `app/api/webhooks/stripe/route.ts` | `lib/billing/lifecycle.ts` **(raw)** |
| `app/api/webhooks/transcription/route.ts` | `lib/capture.ts` *(scoped)* |

`app/api/webhooks/stripe/route.ts` is a **live money surface** and has never been
in the inventory. Note also that the inventory contains
`app/api/square/webhook/route.ts` while `app/api/webhooks/square/route.ts` — a
DIFFERENT route — is absent; the gate's own header refers to "the second Square
endpoint", so the existence of two was known while only one was ever classified.

**Why this is ruling 168 again.** The scanner searches for a NAME
(`@/lib/prisma`) and the dependency is on an EFFECT (reaching the database). This
is the second appearance of that exact failure in this codebase's own test
apparatus. The first was the privilege grep. Ruling 200 is its third register:
the C37 gate would have passed either version of the Acuity key, because it
tested what the code intended rather than what it did.

**What was NOT wrong.** Every assertion the gate makes is true, and the exemption
really is exactly two routes. The inventory is not false; it is incomplete, and it
reports itself complete. That is the harm — `check("every such route is
classified", unknown.length === 0)` reads as a proof of coverage.

---

## 2. Scope

### A. The fourth `Kind`: `m2m-payload`

```ts
type Kind = "visitor-host" | "m2m-host-exempt" | "m2m-payload" | "platform";
```

Ruling 113 already says payload attribution is the CORRECT answer for a machine
caller; the gate has vocabulary only for the wrong one. `m2m-payload` requires,
per entry, the FIELD attribution is drawn from — not a promise that it is, the
name of the thing read. It takes no `tracking` item, because it is not
transitional; it is the destination.

### B. Transitive detection

Follow `@/`-prefixed imports through the graph, marking a route as reaching the
database if any module in its closure imports `@/lib/prisma`, `@/lib/tenancy` or
`@/lib/prisma-internal`.

**On proportionality (the dispatch asked):** it is not disproportionate. A
prototype walked the whole of `app/api` in well under a second, every one of the
nine sits one or two hops from the database, and the walk needs no type
information — just import text and a resolver for the three `@/` spellings
(`.ts`, `.tsx`, `/index.ts`). It ships.

Report the PATH, not just the hit: `route -> lib/x.ts -> lib/y.ts [RAW]`. A
classifier who cannot see how a route reaches the database cannot classify it,
and the path is what makes an entry auditable later.

### C. Classify the nine (authorized by the dispatch)

**Classify; do not modify behaviour.** If classifying a route reveals it behaves
wrongly, STOP and report. Do not fix it inside this build. This applies with
particular force to the two money surfaces.

Expected shapes, to be confirmed against each file rather than assumed:
- `webhooks/stripe` — `m2m-payload`; tenant from the event's `customer` id.
- `webhooks/square` — read it before classifying; the inventory's existing Square
  entry is a different route, and `lib/payments/webhook.ts` is documented as
  resolving tenant from `merchant_id`, which would make it `m2m-payload` while
  its sibling stays `m2m-host-exempt`. If so, say so plainly: two Square
  endpoints, two different attribution models.
- `webhooks/calendly`, `webhooks/acuity/[token]` — `m2m-payload` (C37).
- `webhooks/transcription`, `recording/webhook`, `inbound/remarkable` — provider
  callbacks; establish what each actually attributes by.
- `auth/[...nextauth]` — not m2m. It is the sign-in surface; it has no session
  BECAUSE it is the thing that creates one. Likely needs its own honest
  classification rather than being forced into an existing one.
- `signup/slug` — a public browser surface that provisions tenants.

### D. Prove it able to fail (ruling 110)

Add a throwaway route reaching scoped data **through a helper**, show the gate
RED naming it, remove it, show GREEN. A gate extended to close a blind spot must
demonstrate the new detector firing, not merely still passing.

### E. Ruling 109 — record the limits

The header must state what the new detector still cannot see: dynamic
`import()` with a computed specifier, a re-export chain that launders the
identifier, and any database access not routed through those three modules. The
old limitation text ("a route that reaches scoped data through a helper this scan
does not follow is invisible to it") was ACCURATE and was written down — and the
blind spot survived anyway, for as long as nobody measured it. A confessed
limitation is not a closed one, and the header should say that too.

---

## 3. Out of scope

- Changing any route's behaviour or attribution.
- Deleting the two-route `m2m-host-exempt` exemption — that is P6's work.
- Anything about `/founders`, `next/font`, or C36.

## 4. Verification

- `host-tenancy` green with all routes classified, and the count NAMED (9 → 18,
  stated in the report, ruling 38).
- The able-to-fail demonstration, both directions, in the report.
- Sweep green. Full inventory printed for the Architect.
