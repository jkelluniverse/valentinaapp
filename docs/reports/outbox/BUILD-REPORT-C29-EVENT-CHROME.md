# BUILD REPORT — C29-EVENT-CHROME

**Status: COMPLETE.** Gate `audits/event-chrome-verify.ts` **15/15**, including the
shippability check: the default tenant's five pinned surfaces byte-identical to the
`f07a035` fixture. The ruling-11 16-screen screenshot baseline, captured before any
code change and diffed after: **BASELINE MATCH — her portal is unchanged** (pixel-level
second instrument for `/login`). Full regression green before merge. Checkpoint
protocol followed. Merged ahead of the Sept 18 freeze.

## What shipped

- **The four auth screens resolve their wordmark from the request's tenant** via one
  shared server component (`components/AuthWordmark.tsx`) using the portal shells'
  exact expression (`branding.portalTitle || "veritas"`). `/login` split into a server
  page + `LoginClient.tsx` (the form untouched); the other three were already server
  components. Under C26's `unresolved`, the brand line renders NOTHING — the
  `|| "veritas"` fallback deliberately does not fire on the neutral shell, because a
  borrowed wordmark on an unresolvable host is the hole C26 closed (A4, gate-proven).
- **Tab chrome too** — found during the build: the ROOT LAYOUT's metadata prints
  `Veritas` into `<title>`, `application-name` and the apple-web-app title on every
  host. The four auth pages now carry `generateMetadata` (`lib/auth-metadata.ts`):
  the default tenant's `"veritas"` capitalizes to exactly the `"Veritas"` the layout
  always emitted (byte-identical); practice B's tab says B; `unresolved` says the
  page's own heading ("Sign in"). Scoped to the four pages — the root layout's static
  metadata is untouched, so no static page went dynamic.
- **Non-default root → `/book` redirect**, in middleware (matcher already covered
  `/`). Middleware cannot reach the database, so it asks a new one-question endpoint
  (`/api/tenant-kind`: the C26 resolution kind + is-default, nothing else), cached
  60s per host. The default slug short-circuits with ZERO cost on Valentina's hosts;
  an unknown slug passes through (V6: today's behavior, unchanged); any failure
  passes through (C26 semantics, never a guess). Trivially revertible: one matcher
  branch + one helper.
- **A5 answered and fixed:** a fresh practice has no availability rules, and `/book`'s
  empty state said "**Valentina** will find a time with you" on every host — the
  redirect would have landed every event-minted practice on her name. The empty state
  now names the visiting practice (`practiceName` prop, passed ONLY for non-default
  tenants; the default tenant renders its original copy byte-for-byte, its page's own
  voice).

## The five assumptions

1. **A1 CONFIRMED AND WIDENED** — the four auth files were the complete set of
   `veritas ✧` chrome literals; the `.ics` UIDs, export filenames, webhook header and
   storage keys are not chrome and are untouched. The sweep found TWO more identity
   surfaces the spec missed: `/book`'s empty-state copy (fixed, above) and the root
   layout's `Veritas` tab metadata (fixed, above — both with the default tenant
   byte-identical).
2. **A2 CONFIRMED on data** — `branding.portalTitle` is exactly `"veritas"` in the
   live default-tenant row AND in migration 33's canonical INSERT, which production
   carries. The no-acceptance argument stands.
3. **A3 CONFIRMED** — the public wall covers `app/(public)/**` and bans auth/prisma
   imports; the auth screens live outside it and `@/lib/tenancy` is not a banned
   import. `lint:wall` green.
4. **A4 CONFIRMED behaviorally** — under the injected C26 failure, B's `/login`
   renders no wordmark at all (no veritas, no practice name) and the root serves the
   resolution-independent static bytes. The hole stays closed.
5. **A5 CORRECTED** — the redirect target was NOT honest for an availability-less
   practice (it named Valentina); fixed as part of this build rather than left as a
   proposal, since shipping the redirect without it would have shipped the defect
   back. Judgment call, disclosed for ratification.

## "Byte-identical" — stated precisely

Next SSR embeds build-specific artifacts (hashed asset paths, hydration payload
scripts) that differ between ANY two builds of identical source. The fixture
comparison normalizes both sides identically: script blocks stripped, build hashes
normalized, and the count of script stubs ignored (the async wordmark component adds
one hydration chunk — build shape, not rendered content). Every byte a browser
renders — every tag, attribute, class, text — is compared verbatim, and the
screenshot baseline covers `/login` at the pixel level as the independent second
instrument. `/must-change` 307s for anonymous visitors, so its fixture pins the
redirect shape; its wordmark is the same shared component the other three pin
byte-for-byte.

## Platform host (spec §build-order 2) — left, and here is the "say so"

The apex platform host maps to the default slug in `slugFromHost`, so putting the
Psychefolio identity there means touching the resolution seam four days before a
freeze, for a host that does not yet point at the app. Left deliberately; it belongs
to the brand-web track with the rest of F2's remainder (the `/book` page's static
copy is likewise still Valentina's on every host — documented, out of scope here).

## Verification

- `audits/event-chrome-verify.ts` **15/15** — fixture pinned at `f07a035`, capture
  proven deterministic (two captures byte-equal) before any code changed.
- 16-screen baseline: match, all 16 (captured pre-change this session per ruling 11;
  the committed `docs/baseline/` reference untouched — working-tree capture restored
  from git before commit).
- Full regression: all 35 gates green (list in the commit message), stamp audit
  exit 0 last.

## Decisions taken (for Architect ratification)

(a) The A5 fix was built rather than proposed (reasoning above).
(b) The tab-metadata fix (a fifth/sixth chrome surface the spec did not enumerate) —
    same pattern, same byte-identity proof, scoped to the four auth pages only.
(c) The middleware asks `/api/tenant-kind` rather than embedding DB access; the
    default slug is duplicated as a literal in middleware ("valentina") because
    `lib/tenancy` imports the raw prisma client and cannot load there — commented at
    the site.
(d) `unresolved` tab title is "Sign in" (the page's own existing heading) — the one
    place a neutral word was needed; EN-only, matching the page's existing EN-only
    convention (pre-existing, flagged).
(e) The gate's byte-identity normalization (script stubs) as documented above.
