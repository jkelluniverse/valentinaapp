# C35 STAGE 1 — /founders stops 404ing. And a defect the hop exposed.

**Sweep 44/44, `SWEEP EXIT: 0`, stamp-audit last. Pushed `afe9653..e3bb152`.
Deploy `55a624b7` SUCCESS 16:54:20Z.**

---

## THE FINDING, FIRST — `?source=` IS PRESERVED AND THEN IGNORED

Stage 1 does exactly what was dispatched: it carries the query string through
the hop. **`/join` then throws it away**, because `/join` reads `?src=`, not
`?source=`.

The chain, all four links verified in the code:

| step | file | behaviour with `?source=X` |
|---|---|---|
| 1. the hop | `app/founders/page.tsx` | preserves `source=X` — **verified live** |
| 2. read | `app/(public)/join/page.tsx:53` | `searchParams.src` is **undefined** → falls back to `DEFAULT_SOURCE` |
| 3. default | `lib/capture-config.ts:23` | `DEFAULT_SOURCE = "web"` |
| 4. hidden field → write | `join/page.tsx:117`, `join/actions.ts:52,77` | stores `source: "web"` |

`grep` for `searchParams.source` across `app/` and `lib/` returns **nothing** on
the join path. The only `source` readers are the admin export filter and the
`book`/`signup` form bodies — none of them this funnel.

**Consequence, live right now:** every card scanned between Stage 1 landing and
Stage 2 shipping is stored as `source: "web"` — **indistinguishable from a
walk-in**. The attribution the printed cards exist to produce is silently lost.
The hop is not the bug; it faithfully carried a parameter nothing downstream
reads.

**I have NOT fixed it, and the reason is not ruling 178.** The obvious fix —
having the redirect emit `?src=X` alongside `?source=X` — lives entirely inside
my own new file and touches nothing existing, so it is authorized. I stopped
because **the value that lands in the `source` column is Jacob's taxonomy
decision, not an engineering one**, and it has a consequence that is easy to
miss:

`lib/engage-sequences.ts:41` — `EVENT_SOURCE_PREFIX = "event-"`, and the
`event-lead` sequence's audience is `source.startsWith("event-")`. The existing
printed QR stamps use `event-sept23`. The new cards use
`psychk-health-wellbeing-ftl-2026`, which does **not** start with `event-`.

So there are two card families with two different tags, and the choice decides
whether these leads ever enter the event follow-up sequence. Three options,
Jacob's call:

- **(a)** map `source` → `src` verbatim. Leads tag as
  `psychk-health-wellbeing-ftl-2026`, clean attribution, **not** in the
  `event-lead` sequence.
- **(b)** map to an `event-`-prefixed tag (e.g. `event-psychk-ftl-2026`). Clean
  attribution **and** they enter the follow-up sequence.
- **(c)** leave it. Every card scan reads `web`.

**(c) is the current live behaviour.** I would not leave it there, and the
engage gate being closed does not help — the tag is written now and the sequence
is evaluated at tick time against whatever was stored.

---

## VERIFIED LIVE (deploy `55a624b7`)

**The hop, apex and www:**

```
psychefolio.com/founders        -> 307  https://psychefolio.com/join
www.psychefolio.com/founders    -> 307  https://www.psychefolio.com/join
```

www stays on www — the relative `Location` is same-origin by construction, so
the visitor is never bounced across hosts mid-funnel.

**Query string survives, including repeated keys:**

```
/founders?source=psychk-health-wellbeing-ftl-2026
  -> 307 …/join?source=psychk-health-wellbeing-ftl-2026
/founders?source=a&source=b&ref=XYZ123
  -> 307 …/join?source=a&source=b&ref=XYZ123      (both values kept)
```

**Tenant hosts still 404** — no founding funnel on a practice's domain:

```
valentinavelez.com/founders             -> 404
psf-rehearsal.psychefolio.com/founders  -> 404
nosuchtenant.psychefolio.com/founders   -> 404
```

**Regression — nothing moved.** Her root **200**, `37295` bytes, her title,
`NEXT_REDIRECT` 0, `__next_error__` 0, ruling-44 counts **35/6**. Seven surfaces
all 200. Platform front doors: `/` → 307 → `/platform`, and `/platform`,
`/signup`, `/join`, `/privacy` all 200.

---

## RULING 178 — SATISFIED BY CONSTRUCTION

Stage 1 adds **one file** and modifies **none**: `app/founders/page.tsx`.

A tenant host gets `notFound()`, which renders `app/not-found.tsx` inside the
same root layout as any unknown path today, so a practice's visitors see no
change whatsoever.

## RULING 172 — WHY THE REDIRECT IS RELATIVE

A relative `Location` is same-origin **by construction**: there is no origin to
compute, so nothing can get it wrong. The route needs neither `publicOrigin()`
nor a `nexturl-allow` pragma, and `searchParams` is a page prop, so `nextUrl` is
never touched at any depth.

**Scanner coverage proven both directions**, not assumed: planting
`req.nextUrl.origin` in the new file makes `nexturl-origin` flag
`app/founders/page.tsx:45` and exit 1; restoring returns it to clean.

**A second scanner limit was found while doing that.** My first negative control
used `req?.nextUrl?.origin` and was **not** flagged — the pattern is
`\.nextUrl\.origin`, and optional chaining evades it. For a minute that looked
exactly like "the scanner does not scan this file". **A malformed control that
passes is indistinguishable from coverage.** Both limits are now in the
scanner's header per ruling 109, alongside ruling 172's.

---

## WHAT I DID NOT PROVE, AND WHY

**A live no-JS submission arriving via `/founders`.** It is gate-proven — the
`demo-path` entry in the 44/44 sweep drives `/join` with JS disabled, EN and ES,
over real HTTP, through to the thanks screen and the stored row — and the
`capture` gate asserts source persistence directly (`?src=…&ref=…` landing in
`source` + `referredByCode`).

What I did not do is **write a prospect row into production two days before the
event**. The cleanup that closed last week deleted 299 audit rows of exactly
that kind of debris. Staging cannot stand in: its host is not the platform
domain, so `staging/founders` correctly **404s**.

The consequence is honest rather than hidden: **the `source` value in a real
stored row is unverified by me**, and §1 says it would currently read `web`.
Confirming it needs one read-only statement from Jacob (ruling 73), ready below.

---

## FOR JACOB — read-only, one statement, Railway Query tab

```sql
SELECT "source", count(*) AS rows, max("createdAt") AS newest
  FROM "PractitionerProspect"
 GROUP BY "source"
 ORDER BY rows DESC;
```

One row per distinct tag, biggest first. Today it should be a short list. After
the event it answers, in one look, how many people the cards actually brought —
and whether they landed as `web` or as their own tag.

---

## STANDING EXPOSURE, NAMED (ruling 174)

`/founders` is a **printed URL** whose only protection until Stage 2 is one file
with no standing-set entry. Stage 1's dispatch specified a 44-entry sweep and V8
adds the entry with Stage 2, so I did not add it tonight. **If Stage 2 slips past
the 23rd, that entry should land on its own.**
