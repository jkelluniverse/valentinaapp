# Item 4 / task #12 — ANSWERED. The premise was false.

**Read-only. Nothing changed. Production's `AUTH_URL` was not touched.**

## THE QUESTION DISSOLVES

The task was: *why can the deployed auth callback not see `x-forwarded-host`
when the same deployment resolves tenancy by it?*

**It can see it. It never looks.** The header-based derivation and the route
handler are two different code paths in the same library, and the callback is
not on the one that reads headers.

## THE MECHANISM, FROM THE INSTALLED SOURCE

Only ONE place in `@auth/core` reads the header
(`node_modules/@auth/core/src/lib/utils/env.ts:94`):

```js
const detectedHost = headers.get("x-forwarded-host") ?? headers.get("host")
```

That is `createActionURL()`, and its callers are `getSession`, and the
server-action helpers `signIn` / `signOut` / `session`
(`node_modules/next-auth/lib/actions.js:10,59,76`). **The `/api/auth/*` route
handler is not among them.**

The route handler is (`node_modules/next-auth/index.js:130`):

```js
const httpHandler = (req) => Auth(reqWithEnvURL(req), config)
```

`reqWithEnvURL` (`node_modules/next-auth/lib/env.js:5`):

```js
const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
if (!url) return req;                                  // unpinned: passes THROUGH
const { origin: envOrigin } = new URL(url);
const { href, origin } = req.nextUrl;
return new NextRequest(href.replace(origin, envOrigin), req);
```

and `Auth()` then does (`node_modules/@auth/core/lib/utils/web.js:23`):

```js
const url = new URL(req.url)     // ← the request URL. NOT the headers.
```

## THIS EXPLAINS BOTH OF P4'S OBSERVATIONS EXACTLY

A no-JS sign-in POSTs to `/api/auth/callback/credentials` — the **route
handler**, never the server action. So:

| `AUTH_URL` | what the handler builds the redirect from | P4 observed |
|---|---|---|
| set (staging pinned at production) | env origin, via `reqWithEnvURL`'s rewrite | `https://valentinaapp-production.up.railway.app/login?error=…` |
| `""` (falsy → `return req`) | `req.nextUrl.origin` = the container-internal origin | `https://localhost:8080/login?error=…` |

Both are the documented behaviour of the code above. Nothing was broken.

## THE LIVE CONTROL — THE HEADER IS DELIVERED, ON EVERY HOST

`/api/health` computes `seenHost` with **the identical expression** Auth.js's
header path uses (`x-forwarded-host ?? host`, `app/api/health/route.ts:13`), so
it is the right instrument rather than a nearby one. Measured just now:

```
valentinavelez.com                    -> seenHost "valentinavelez.com"
psf-rehearsal.psychefolio.com         -> seenHost "psf-rehearsal.psychefolio.com"
psychefolio.com                       -> seenHost "psychefolio.com"
valentinaapp-staging.up.railway.app   -> seenHost "valentinaapp-staging.up.railway.app"
```

Four hosts, including the staging deployment where P4 saw `localhost:8080`.
**Header propagation was never the problem**, and P4's framing carried a hidden
false premise — which is why it was right to stop rather than unpin.

## THE THIRD INSTANCE OF ONE ROOT FACT

`req.nextUrl.origin` inside the Railway container is the **internal** origin, not
the public one. This program has now hit that three times:

1. **C32 §2** — the middleware self-fetch left the box via the public origin and
   came back with the wire host, so `tenant-kind` answered about the wrong host.
2. **P2.2** — the `/platform` rewrite built from `req.nextUrl` became
   `https://valentinavelez.com/platform` and 404'd.
3. **Item 4 (this)** — `Auth()` builds its redirect from `req.url`.

`middleware.ts` already carries the remedy and has been proving it in production
since C29: `publicOrigin(req)`, built from `x-forwarded-host` / `x-forwarded-proto`.

## THE SHAPE OF THE FIX — NOT APPLIED, NOT NOW

Unpinning `AUTH_URL` alone is still wrong; it trades a wrong-but-absolute host
for an internal one. The fix is to give the route handler the public origin,
mirroring what `reqWithEnvURL` does but from the headers the edge demonstrably
sends. `app/api/auth/[...nextauth]/route.ts` is today two lines:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

so the wrapper has an obvious home, and `publicOrigin()`'s logic is already
written and production-proven in `middleware.ts`.

**Verification it would need** (not a suggestion to do it now): the no-JS
sign-in redirect observed on THREE hosts — her custom domain, a practice
subdomain, and staging — since a single-host check cannot distinguish "correct"
from "pinned to the one host I tested".

**This is a post-event item.** It touches the sign-in path of a live practice
four days before the event, and nothing is currently broken for her: production
is pinned to its own host, so her sign-in redirects correctly today. The defect
is that a SECOND practice signing in on its own subdomain would be redirected to
hers — which matters for P6/brand-web, not for the 23rd.
