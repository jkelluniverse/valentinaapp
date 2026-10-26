# C32-MIDDLEWARE-ORIGIN

Header: C32 · depends-on C29, C30, the rehearsal walk · **P0 — demo path, live, today** ·
2026-09-16. Dispatched by the Architect on the rehearsal's W5 failure (ruling 76).

WHY: a founding practitioner who types their own subdomain lands on Valentina's
marketing page — 17 "valentina" occurrences, zero their own. C29's middleware redirect
never worked in production and has not since it shipped (ruling 76); every gate that
asserted it passed because the in-process self-fetch targets localhost and succeeds. A
gate cannot prove a deployment seam.

ASSUMPTIONS TO VERIFY, NOT TRUST — the Architect's, not facts.
  A1. The middleware's self-fetch to its own public origin fails inside Railway's edge.
      BELIEVED, NOT PROVEN — the silent catch means nobody has seen the error. PROVE
      THE MECHANISM FIRST: make the catch log, deploy, hit the host, read the actual
      error. Do not fix a cause that has not been observed.
  A2. The honest fix removes the self-fetch rather than re-pointing it. A middleware
      that makes a network call to itself on every root request is fragile by
      construction. If the tenant kind can be derived in-process without pulling prisma
      into the edge — a signed header, a cookie, an env-derived slug list, or letting
      the page itself redirect server-side rather than the middleware — prefer that.
      State the options and recommend one BEFORE building.
  A3. The default tenant's behavior must stay byte-identical, as C29 proved. Assert it.
  A4. /book already renders correctly on the minted host (the walk's probe showed PSF
      Rehearsal Studio), so ONLY the root hop is broken. Confirm; if more is broken,
      say so.

LAWS: C26 fail-closed must not regress. Ruling 61 (status line first). Ruling 77 (no
silent catch — any catch on a control-flow decision logs before it returns). Default
tenant byte-identical.

BUILD ORDER:
  1. Make the catch log; deploy; observe the real error; report it BEFORE building the
     fix. STOP for the Architect's ratification of the A2 approach.
  2. Implement per A2's recommendation once ratified.
  3. C30's demo-path gate gains a root-hop assertion at whatever level it can honestly
     reach, and the report states plainly what that gate can and cannot prove about
     deployment.

VERIFY:
  V1. A1–A4 answered with observed evidence.
  V2. The ACTUAL error quoted.
  V3. The root hop works on the LIVE minted host — the psf-rehearsal tenant stays up
      until this passes; that is what it is for.
  V4. Default tenant byte-identical + 16-screen baseline.
  V5. C26 gates green.
  V6. Standing set green, stamp-audit LAST, exit 0.

OUT OF SCOPE: C28, brand-web, the apex, marketing copy, teardown, the engage gate.

SEQUENCE (Architect's): A1's real error reported → STOP for A2 ratification → build,
verify, deploy → resume W6–W8 on the still-standing psf-rehearsal tenant → Block 2,
then Block 3. FREEZE: Sept 20 — this is a demo-breaking fix and ships regardless.
