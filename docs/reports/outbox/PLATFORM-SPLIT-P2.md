# PLATFORM SPLIT — P2 REPORT (apex routed, placeholder up, platform chrome)

**The platform's own domain no longer impersonates a practice.** psychefolio.com
served Valentina's marketing page — her title, 35 "valentina" — to anyone who typed
it. It now serves the Psychefolio placeholder, and /signup and /join on that host
wear platform chrome.

## What was built

**One pure helper, shared by two runtimes.** `lib/platform-host.ts` exports
`isPlatformHost(host)` and `PLATFORM_NAME`, with NO imports at all — which is what
lets middleware (edge) and server components share ONE definition instead of the
literal-duplication middleware needed for `DEFAULT_TENANT_SLUG`. It answers a
question about the host STRING only; it is not tenant resolution and must not
become it.

**P2.2 — the placeholder, reached by a REDIRECT.** `middleware.ts` redirects `/` to
`/platform` on the platform host (it first shipped as a rewrite and 404'd in
production — see the section below, which is the more useful half of this report).
**Tenant hosts never reach that branch, so the static root and its 16-screen
baseline are untouched**; the route table still shows `○ /` (static). `app/(public)/platform/page.tsx` carries a host guard and 404s
anywhere else, so a practice's domain can never serve the platform's placeholder
(verified: valentinavelez.com/platform → 404). The page is labeled in code, in a
banner comment, as REPLACED WHOLESALE when Jacob's content files land — with the
prohibited list named inline so it cannot drift: no marketing copy, no pricing, no
dollar figure, no "free" (law 2). Its content is the wordmark, one factual sentence
("The public site is in preparation."), and the two links that must work.

**P2.3 — platform chrome.** `PublicHeader`/`PublicFooter` take a `platform` flag:
no practice wordmark, **no "Book a call"** (there is no practice to book on the
platform's domain), no credential line, no postal address (ruling 96). Colors are
Psychefolio brand v1.1 indigo/cream, because wine/mocha is tenant #1's Warm Stone
palette and never appears on a Psychefolio surface (Jacob, 2026-09-08). The
components stay behind the public wall — a boolean prop, no data imports; lint-wall
green.

**Root-layout identity, found during verification.** The apex was emitting
`application-name: Veritas` and an Apple web-app title to match — tenant #1's
internal product name installed as the platform's PWA identity. The root layout now
resolves the platform name on the platform host, using the same build-time-safe
`headers()` pattern the existing code uses (throws outside a request → "not the
platform host" → her output byte-identical).

## Verify

- **V1 — her domain unchanged.** Local: root 200 and `<title>Rewrite Your
  Subconscious Mind, Transform Your Life.</title>`; /signup and /join still titled
  `· Valentina Vélez`. Route table `○ /` unchanged. event-chrome (16-screen baseline
  MATCH) and the full set below. Live check after deploy, quoted in the closing
  section.
- **V2 — the placeholder, counted as asked.** psychefolio.com/ → 307 →
  `/platform` → 200, `<title>Psychefolio</title>`, **visible "valentina": 0,
  visible "veritas": 0**.
  Raw-HTML "veritas" is 2, both the internal `veritas-theme` localStorage key inside
  a script tag — the same irreducible identifier named in W6, not visible text.
  Down from 6 before the root-layout fix.
- **V3 — /signup and /join on the apex.** Both 200, titled `· Psychefolio`, visible
  valentina/veritas 0/0, platform chrome. The founding-partner affordance still
  works with a ref code: `/signup?ref=HZ9QE4RZ` renders the "Founding partners"
  label and its description.
- **V4, V5, V6** — see the sweep; psf-rehearsal's root hop and C26 fail-closed are
  standing-set entries and were re-run whole.
- **V7 — MX/SPF/DMARC re-queried after the deploy** and quoted below. Code cannot
  touch DNS; asserted anyway because this is the deploy that lands on that domain.
- **V8 — re-run, and it still reports the fallback**, exactly as predicted. Quoted
  below. The placeholder is what a visitor sees; the RESOLUTION stays wrong until P3
  removes the fallback. Reported, not treated as a failure.

## THE DEFECT I SHIPPED, AND OWNED — the rewrite 404'd in production

P2.2 first shipped as a middleware REWRITE whose target was
`new URL("/platform", req.nextUrl)`. Locally it was green, in the 37-entry sweep it
was green, and **in production psychefolio.com/ returned 404** — carrying HER
metadata.

The cause is C32's finding, in code I wrote AFTER establishing it:
`req.nextUrl.origin` is the DEFAULT TENANT'S domain in production regardless of who
is visiting, so the rewrite target became `https://valentinavelez.com/platform` —
her host, where this route's own guard correctly refuses. **The deployed server
printed the evidence in its own response header**, which is how it was diagnosed in
minutes rather than guessed at:

```
x-middleware-rewrite: https://valentinavelez.com/platform
```

Isolation before the fix, so the diagnosis rested on evidence and not on the first
plausible story: `psychefolio.com/platform` requested DIRECTLY returned **200 with
`<title>Psychefolio</title>`** (page and host guard both correct), and
`valentinavelez.com/platform` returned **404** (guard correctly refusing) — so the
page was never the problem; only the rewrite target was.

**The fix is a REDIRECT, not a re-pointed rewrite,** and the distinction matters:
rebuilding the target from `publicOrigin()` would have corrected the address but not
the mechanism, because a rewrite whose origin differs from `nextUrl`'s is PROXIED —
the app would fetch its own public URL back through Railway's edge, the exact
self-fetch pattern C32 removed from this same file. The redirect uses the same
`publicOrigin()` builder that the `/book` hop has been proving in production since
C29. Honest cost: the address bar reads `/platform`.

**Why no gate caught it, stated plainly:** this is ruling 76 again — a gate cannot
prove a deployment seam. Locally `nextUrl.origin` IS the request's origin, so the
rewrite target was correct on every machine a gate runs on. What caught it was the
ruling-48 live check, within minutes of the deploy, which is the system working as
designed after ruling 76 — not a gap in it.

## Findings — reported, NOT fixed

1. **The PWA manifest hardcodes "Veritas" for every host.** `app/manifest.ts` is a
   static route returning `name: "Veritas"`, `short_name: "Veritas"` on every
   domain — so psf-rehearsal installs as "Veritas" too, and so would the platform.
   This is a CROSS-TENANT leak wider than P2 (it predates it and affects practices,
   not just the platform), so it is reported for the brand-web / C31-remainder track
   rather than fixed inside a phase scoped to the platform host.
2. **The /signup and /join page BODIES still use Warm Stone tokens** (`text-mocha`
   and friends) on the platform host. P2.3's scope was chrome, and re-skinning page
   bodies is design — brand-web's, and explicitly out of scope here. The chrome
   around them is the platform's; the forms inside still wear her palette.
3. **`www.psychefolio.com` is treated as the platform host — a scope judgment,
   disclosed.** The dispatch named the apex. I included `www` because it is the same
   site by convention, it is already in `RESERVED_SLUGS` so it can never be a
   practice, and it was ALSO publicly serving her marketing under the platform's
   name — the same defect P2.2 exists to stop. Trivially reversible: one clause in
   `isPlatformHost`.
4. **`psychefolio.com/book` still serves the default tenant's booking page** until
   P3. Nothing on the platform host links to it any more (the platform chrome has no
   "Book a call"), but typing the URL reaches it.
5. **noindex on the platform host while the placeholder stands.** A placeholder
   should not be in a search index. It applies to the whole platform host including
   /signup, and Jacob's content files flip it back — named because it is a choice,
   not an oversight.
