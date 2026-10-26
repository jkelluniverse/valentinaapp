# P5 items 1 and 3 — live verification, and the one thing it does NOT prove

Sweep **44/44, `SWEEP EXIT: 0`**, zero FAIL. Pushed `9d5bfc5..640e64a`.
Production deploy `b0504aa2` SUCCESS 22:45Z. Items 1 and 3 have been live since
deploy `f6553a5c` at 22:21Z.

**THE HEADLINE, STATED FIRST BECAUSE IT IS THE WEAKNESS:** item 3 changed her
WRITE path, and production has not executed a single write through it. Details
in §4. Everything else below is proven.

---

## 1 — HER PRACTICE, LIVE

Seven surfaces on `valentinavelez.com`, all **200**:
`/book · /join · /signup · /privacy · /login · /api/health · /api/tenant-kind`

Root: **200**, `37295` bytes, `<title>Rewrite Your Subconscious Mind, Transform
Your Life.</title>`, `NEXT_REDIRECT` **0**, `__next_error__` **0**, and the
ruling-44 raw counts **valentina=35 / veritas=6** — the pinned baseline,
unmoved. Re-read after deploy `b0504aa2` landed: identical, byte count included.

`/api/tenant-kind` on her host: `{"kind":"tenant","isDefault":true}`.

Tick runs on the new build at **22:30Z** and **22:44Z**, both
`[tenant-scope] host=valentinavelez.com tenantId=tnt_valentina_000000001
via=TenantDomain`. Her practice resolves and reads.

## 2 — A LIVE NON-DEFAULT PRACTICE

`psf-rehearsal.psychefolio.com` — the surviving rehearsal tenant, so this costs
no debris:

- `/` → **307** → `https://psf-rehearsal.psychefolio.com/book` (C29 redirect)
- `/api/tenant-kind` → `{"kind":"tenant","isDefault":false}`
- `/book` → **200**, and **zero** occurrences of "valentina" in the page

Her identity does not leak onto another practice's host. C29/C31 hold live.

## 3 — THE UNRESOLVED FLIP, AND A DISTINCTION THE DISPATCH DID NOT NAME

There are **two** non-tenant outcomes live, not one, and they behave differently
on purpose (ruling 113):

**`unresolved`** — `psychefolio.com` itself. Logged live at 22:25Z:
`[tenancy] UNRESOLVED host "psychefolio.com" — no TenantDomain row and no
{slug}.$PLATFORM_DOMAIN pattern (P3.3: the default-tenant fallback is gone)`.
Its front doors are correct: `/` **307** → `/platform`; `/platform`, `/signup`,
`/join`, `/privacy` all **200**.

**`unknown-slug`** — `nosuchtenant.psychefolio.com`, which answers
`{"kind":"unknown-slug","isDefault":true}`. **CHROME still renders HER content
there and the DATA LAYER REFUSES**, which is exactly ruling 113's deliberate
divergence. Proven live in both directions:

| path on the unowned subdomain | result |
|---|---|
| `/` (static) | **200**, valentina=35 veritas=6 — her marketing bytes |
| `/privacy` (static) | **200** |
| `/login` (chrome only) | **200**, valentina=**0** |
| `/book` (**reads data**) | **500** — the data layer refused |
| POSITIVE CONTROL: `/book` on **her** host | **200**, booking heading present |

The same page reads on one host and refuses on the other. That is the
divergence working, not a defect — no row of hers is reachable from a
subdomain nobody owns.

**One rough edge, reported as an observation and NOT as a P5 defect:** the
refusal surfaces as a raw **500**, not C26's neutral **503 /unavailable**. The
`(public)` layout redirects only on `kind === "unresolved"`, and this is
`unknown-slug`. It is a face, not a leak, and it is P3.3-era rather than P5's —
P5 changed only the `update/delete/upsert` branch, and `/book` performs reads.
Flagging it rather than fixing it: it is outside P5 and four days from the event.

## 4 — WHAT IS **NOT** PROVEN, AND WHY

Item 3 changed exactly three methods — `update`, `delete`, `upsert`
(`UNIQUE_WRITE`). `create`, `updateMany` and `deleteMany` are untouched.

**Both production ticks reported all zeros:**

```
[tick] {"tenant":"tnt_valentina_000000001","autoCompleted":0,"lastSessionNotices":0,
"completionNotices":0,"expired":0,"sessionReminders":0,"remindersSent":0,
"reconciled":0,"capturesPolled":0,"paymentTokens":"refreshed=0 flagged=0",
"billingSweep":"suspended=0 webhooksPruned=0","tenantStampDrift":0}
```

Every counter zero means **no `update`/`delete`/`upsert` has run in her tenant
since the deploy**. The tick being green proves it resolved and read. It proves
nothing about the changed branch — this is ruling 110 exactly, and I am not
going to report a quiet log as a passing write test.

**Why I did not simply exercise it.** Every path that reaches `UNIQUE_WRITE` in
her tenant is behind a sign-in, and so are all five of item 1's `emailInUse`
call sites. The unauthenticated surfaces do `create`s (booking, capture) or
belong to the platform tenant, so they miss the changed branch entirely. Doing
it from here would mean either her credentials — which I should not hold — or
inventing a row in a live practice, which is what the cleanup just finished
deleting.

**What bounds the risk in the meantime, exhaustively rather than by sampling.**
The one genuinely new failure mode is `identitySelect()`, which THROWS for a
model whose identity cannot be derived — a throw her tenant could never hit
before, because the check was skipped for her entirely. Measured against the
live schema:

```
scoped models: 79
identifiable delegates: 86
SCOPED MODELS WITH NO DERIVABLE IDENTITY (would now THROW): 0
positive control (a name that cannot exist): correctly reported ABSENT
```

There is no model she can write that the pre-check cannot key. The new throw
surface is empty by construction, not by inspection.

## 5 — FOR JACOB: the 60-second live write exercise

Signed in as Valentina on `valentinavelez.com`, make one harmless **rename** —
a library folder, or a price book entry. Rename it, save, rename it back.

- **A rename is an `update`**, so it goes through the branch item 3 changed.
- **It saving is the positive control.** If the UI shows the new name, her write
  path survived the change.
- **If it fails**, the error will read `tenant-scope: <model>.update target not
  found in tenant scope` and it will be in Railway's deploy logs. Send me that
  line and nothing else; I will not need the database.

Two renames and a screenshot close §4. Until then, item 3 is gate-proven and
schema-bounded, but it is not production-proven, and the report says so.
