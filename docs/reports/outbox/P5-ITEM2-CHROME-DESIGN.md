# P5 ITEM 2 — the chrome category, and `/api/tenant-kind`'s contract

Nothing built. This is the design you said must exist before you could ratify
the held branch, plus a correction: **I recommended (a) before I had read
`staticSiteTenant()`'s body against the five branches. Having read it, I now
recommend (b).** The reason is in §4 and it is not a preference.

---

## 1 — THE FIVE BRANCHES ARE ONE QUESTION, AND IT IS NOT "IS THIS TENANT #1?"

All five compare an id. None of them cares about the id.

| # | site | branch | what it actually decides |
|---|---|---|---|
| 1 | `app/(public)/layout.tsx:73` | `id !== DEFAULT` → tenant's own title/template | whether `DEFAULT_METADATA` (built from `content/site-content.ts`) speaks for this host |
| 2 | `app/(public)/layout.tsx:114` | `id !== DEFAULT` → `practice` name into header/footer | same |
| 3 | `app/(public)/book/page.tsx:22` | `id !== DEFAULT` → drop the description | whether the hardcoded "…with Valentina Vélez" string speaks for this host |
| 4 | `app/(public)/book/page.tsx:48` | `id !== DEFAULT` → pass `practiceName` | whether `SITE.closing`'s voice speaks for this host |
| 5 | `app/api/tenant-kind/route.ts:17` | `isDefault` → middleware `redirect = kind==="tenant" && !isDefault` | whether the **static marketing root** is the right page for this host |

In every one of the five, the right-hand side of the comparison is not tenant
data. It is `content/site-content.ts` — a build-time constant file containing
her copy. The predicate's honest name is **"does the static build speak for
this host?"**, and the reason it is currently spelled `id === DEFAULT_TENANT_ID`
is that the static build was made for her and only for her.

This matters for ruling 154's third place. **Presentation cannot stop naming
her while the bytes it serves are hers.** Renaming the predicate does not
change which bytes ship.

---

## 2 — `/api/tenant-kind`: THE CONTRACT CHANGE, DESIGNED

### 2.1 The consumer set is exactly one, and it shares a process with the route

`isDefault` has **one** reader: `middleware.ts:79-80`. (Verified by grep across
`.ts`/`.tsx`: the other `isDefault` hits are `LibraryFolder`'s unrelated column.
No gate asserts on the field; `audits/host-tenancy-verify.ts:111` and
`audits/nexturl-origin-verify.ts:8` mention the route, not its body.)

The caller reaches it at `http://127.0.0.1:${PORT}/api/tenant-kind`
(`middleware.ts:70`) — **loopback, in-process, by C32 §2's deliberate design**.
So caller and callee are always the same build. There is no rolling-deploy skew
window in which an old middleware could meet a new route body. That is the fact
that makes changing the field safe rather than merely likely-safe, and it is
already proven in production by C32's own fix.

### 2.2 The proposed shape

```
GET /api/tenant-kind  →  { kind: "tenant" | "unresolved", staticRoot: boolean }
```

`isDefault` is removed. `kind` is kept (middleware logs it; it costs nothing).
`staticRoot` means **"the static marketing root is the correct page for this
host"** — the question §1 showed the caller is really asking. Middleware
collapses to:

```ts
const { kind, staticRoot } = await res.json();
const redirect = !staticRoot;
```

The decision rule stops being duplicated on the far side of the wire. Today the
route publishes a fact about *identity* and the middleware re-derives the
*decision* from it; after this the route answers the decision it was built to
answer, which is what its own header comment already claims it does ("the
middleware's one question: what KIND of host is this?").

### 2.3 The truth table, and the four rows it must reproduce

Behaviour must not move. Every row below is **already gated**, which is why this
change needs no new gate — only for the standing ones to stay green:

| host | resolution | today | `staticRoot` | new redirect | gate that pins it |
|---|---|---|---|---|---|
| her host | tenant #1 | 200 static home | `true` | none ✓ | `event-chrome` V5 (pinned fixture of `/`) |
| unknown slug | unresolved | 200 static home | `true` | none ✓ | `event-chrome` V6 (`get("/", HOST_UNKNOWN)`) |
| practice B | tenant B | 307 → `/book` | `false` | 307 ✓ | `event-chrome` V4/A5; `demo-path` §5:402 (real HTTP, 307→`/book`) |
| practice B, DB failing | unresolved (stale) | 200, **no** redirect | `true` | none ✓ | `event-chrome` V7/A4 (`fRoot.status === 200`) |

Row 4 is the one that decides the failure semantics, and it decides them
against me rather than by my choosing: **when resolution fails, today's
behaviour is "do not redirect".** So `staticRoot` must be `true` on failure —
the field fails *toward* the static site, never toward a practice's page. A
design that let a failure read as "not static" would redirect a host whose
identity is unknown into a booking page, which is the C26 defect. `V7/A4`
already asserts the correct outcome, so the mistake is not available.

### 2.4 Why it cannot ship inside P5

`staticRoot` has to be computed, and the only honest computation is
`r.kind === "unresolved" || r.tenant.id === (await staticSiteTenant())?.id`.

That is the same dependency as the other four branches. **The held branch is
not separable from the four it was held apart from.** Holding `isDefault` for a
contract design was right on the contract; the contract was the easy half.

---

## 3 — THE COST OBJECTION I EXPECTED, WITHDRAWN

I assumed routing five chrome branches through `staticSiteTenant()` would add a
query per public page render. It would not. `staticSiteTenant()` →
`tenantByIdChecked()` (`lib/tenancy/index.ts:132`) reads the **same
per-instance 60s cache map** the chrome's existing resolution already uses
(`:40-42`). Cost at steady state is one row per instance per minute, shared.

So (a) is cheap and (a) is safe. It is still the wrong move, for a reason that
has nothing to do with cost.

---

## 4 — WHY I NOW RECOMMEND (b)

`staticSiteTenant()` carries its own deletion order, written when it was built
(`lib/tenancy/index.ts:329-332`):

> TRACKING (P4): the static home is host-agnostic, so a second practice cannot
> have one. Either `/` becomes dynamic and per-tenant, or each practice's
> public site is built separately. **Delete this function when that lands.**

It has **one** call site today (`app/layout.tsx:69`). Option (a) takes it to
six. That converts brand-web's deletion from a one-site change into a six-site
change, and it does it in service of a rename that — per §1 — does not make her
ordinary in presentation, because the bytes are still hers.

That is building on a condemned foundation to buy a cosmetic result. Your fence
around `staticSiteTenant()` was not arbitrary; reading its body is what showed
me why.

**(b): P5 completes ruling 154's first two places and explicitly does not
complete the third.** That is a truthful P5, and the ledger says so out loud
rather than recording a presentation fix that isn't one.

### What (b) costs, stated plainly

Five `DEFAULT_TENANT_ID` comparisons stay in `app/`. P5 cannot be reported as
"no default-tenant reference left in production code". It can be reported as
"resolution and data scoping are hers no longer; presentation still is, because
the marketing bytes still are." I would rather hand you that sentence than a
prettier one.

---

## 5 — THE TRACKING ITEM (b) BUYS

**BRAND-WEB / P6 — the presentation place (ruling 154 #3).** One change, five
sites plus one wire field, all of it blocked on the same prior decision: does
`/` become dynamic and per-tenant, or is each practice's public site built
separately? Until that is answered there is no correct value for `staticRoot`
that is not `staticSiteTenant()` in disguise.

When it is answered, this report's §2 is the contract change, ready to apply:
field swap, one-line middleware simplification, no new gate, four gated rows.

---

## 6 — WHAT I AM ASKING FOR

1. **(a) or (b)**, with §4 in front of you. I recommend **(b)**.
2. If **(b)**: may I close P5 with items 1 and 3 shipped, item 2 deferred with
   the tracking item above, and the two central items still held on Jacob's §6
   census? That is a P5 that ends honestly rather than one that waits.
3. `/api/tenant-kind`'s contract design is **done either way** (§2). Under (a)
   it ships now; under (b) it ships with brand-web. It does not need holding
   again.
