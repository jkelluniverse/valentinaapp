# PLATFORM SPLIT — P4 REPORT (identity follows host)

**A practitioner who signs up for Psychefolio now hears from Psychefolio.** Until
this phase they heard from Valentina's practice — her Resend account, her
letterhead — and since P3.3 they heard from nobody at all, because the platform
host resolves to no practice and C27 correctly refuses to borrow one. Both were
the same defect seen from two sides: the platform had no identity of its own on
this path.

Items 1, 2, 3 and 5 are done. **Item 4 is deliberately not done**, and the
evidence for stopping is below.

## THE VERIFY, READ IN THE INBOX

A real signup on `psychefolio.com`, delivered to a real mailbox. Headers decoded
from the raw MIME:

```
From:       Psychefolio <jacob@psychefolio.com>      ← ruling 94: a NAME, not a bare address
Reply-To:   jacob@psychefolio.com
To:         jkelluniverse+p4verify@gmail.com
Subject:    Your practice portal is live
dkim=pass   header.i=@psychefolio.com header.s=resend
spf=pass    ...@rsend.psychefolio.com
dmarc=pass  header.from=psychefolio.com
```

Body, as delivered:

```
Psychefolio                                          ← the platform wordmark
Your practice portal is live
P4 Mail DELETE ME is set up and waiting for you at p4mail.psychefolio.com.
...
<a href="https://p4mail.psychefolio.com">Open your portal</a>    ← THE BUTTON
—
Kell Systems Consulting, LLC                         ← legal entity ALONE
```

Every clause of the verify, checked against that message:

- **from Psychefolio** — yes, and authenticated as Psychefolio: DKIM, SPF and
  DMARC all pass on `psychefolio.com`, which is a **separate Resend account** from
  the practice one. The identity is not a display-name costume over her sender.
- **signed by the platform** — `Kell Systems Consulting, LLC`, the platform's
  legal entity. **`Valentina` appears nowhere in the message**, in either part.
- **whose button points at the NEW TENANT'S OWN PORTAL** —
  `https://p4mail.psychefolio.com`, the practice just minted. The prose names the
  same host. Before P4 the button carried the SIGNUP host, so the paragraph and
  the button disagreed; on the platform host the button pointed at
  psychefolio.com, which is no practice at all.
- **no postal address on this transactional envelope** — ruling 96, confirmed in
  the delivered footer.

One instrument note: the Gmail API's convenience `sender` field returns
`jacob@psychefolio.com` with the display name stripped, which would have read as a
ruling-94 failure. **The raw MIME says `From: Psychefolio <jacob@psychefolio.com>`.**
Checking the header rather than the summary field is the difference between
reporting a pass and reporting a phantom defect.

## What was built

**Item 1 — the welcome email is platform mail.** It was gated on
`emailConfigured()` — the legacy check, meaning HER key and HER
`NOTIFY_FROM_EMAIL` — and sent on the default path. It is now gated on
`platformIdentity()` and sent with it.

**Item 2 / ruling 94 — the envelope signs with a name.** Done in code, not by
asking for a variable edit: `withDisplayName()` wraps a bare `PLATFORM_FROM_EMAIL`
with `PLATFORM_NAME` and passes a value that already carries one through
untouched. Deterministic, idempotent, no ops dependency, and it cannot regress if
someone edits the variable.

**Item 3 / rulings 96 + 97, in ONE change.** `platformIdentity()` stopped
requiring `PLATFORM_POSTAL_ADDRESS` in the same edit that stopped rendering it —
that is the interlock, and skipping it would have meant that blanking the variable
silently stopped ALL platform mail. The requirement is re-imposed where it belongs:
on **commercial** mail in `lib/engage.ts`, which holds sends and logs loudly
without it. The envelope renders the address **iff** the envelope carries an
unsubscribe link, which is the Architect's own framing — engage is the only
commercial sender and the only path that sets one, so "carries an unsubscribe" and
"is commercial" are one fact here rather than two that could drift apart. What
address commercial mail carries remains Jacob's call; nothing here touches it.

**Item 5 / rulings 82 + 133 — the platform has its own tenant.** Migration 52
creates `tnt_platform_00000000001`, slug `__platform__`, `status: 'PLATFORM'`. All
three audit sites — the capture row and engage's two — attribute to it.
**Ruling 133's tracked constant is deleted and its tracking item discharged.**

## THE CONSTRAINT THAT SHAPED ITEM 5, AND WHY IT IS NOT THE SLUG

A platform tenant row is only safe while **no host can resolve to it**. The
obvious approach — pick a slug nobody could type — does not hold: Railway's
wildcard `*.psychefolio.com` matches whatever `Host` a caller sends, so a crafted
header reaches any slug you like, typeable or not. **The guard is on STATUS, in
code, in both resolvers**, because a status cannot be spoofed by a header.

Proven live in production, on the real wildcard:

```
https://__platform__.psychefolio.com/api/tenant-kind  →  {"kind":"unresolved","isDefault":false}
```

And proven in the gate with **both positive controls** (ruling 110), because a
claim about a refusal is worthless without proof that resolution works at all:

```
✓ positive control: the subdomain pattern DOES resolve a real practice — valentina → tenant
✓ a crafted Host on the wildcard cannot reach it via the SUBDOMAIN PATTERN — unresolved
✓ positive control: a TenantDomain mapping DOES resolve a real practice — localhost → tenant
✓ even an explicit TenantDomain row pointing AT it cannot reach it — unresolved
```

## ITEM 4 — STOPPED, WITH THE EVIDENCE

The dispatch was to unpin `AUTH_URL`. I proved it on **staging** first,
credential-free, by watching where a bogus no-JS sign-in redirects.

**Before** — and this is a defect in its own right, worse than W7 recorded:
staging's no-JS sign-in bounced to a **production** host.

```
location: https://valentinaapp-production.up.railway.app/login?error=CredentialsSignin
```

**After** setting `AUTH_URL=""` (confirmed from the installed `@auth/core` source
to be falsy at every read site — `if (url)`, `if (envUrl)` — and therefore
identical to deletion, with `trustHost: true` short-circuiting the `??` default so
"UntrustedHost" was never a risk):

```
location: https://localhost:8080/login?error=CredentialsSignin
```

Auth.js fell through to `headers.get("x-forwarded-host") ?? headers.get("host")`
and got the container-internal host. **Yet `x-forwarded-host` is demonstrably
correct on that same deployment** — `/api/tenant-kind` on staging resolves by it
and answers `{"kind":"tenant","isDefault":true}`. So something specific to the
auth callback path is not seeing that header, and I do not know what.

Unpinning without that answer trades a wrong-but-absolute host for a broken one,
on the sign-in path of a live practice. **Staging was restored to its own host** —
a strict improvement on pointing at production — and **production's `AUTH_URL` was
never touched.**

The precondition the dispatch named is confirmed: `trustHost: true` is explicit at
`auth.config.ts:6`, and **no gate sets `AUTH_URL`**, so all 42 standing entries
already run unpinned. The target configuration is gate-proven; what is missing is
why the deployed auth callback cannot see the forwarded host.

## What P4 could NOT achieve, stated rather than papered over (A3)

**The tick still runs in her scope.** One external scheduler calls her host, so
every scheduled step — engage's platform marketing included — executes inside
tenant #1's scope. P4 fixed what engage SENDS AS (already platform) and what it
STAMPS (now the platform tenant), because those rows state their tenant
explicitly. It did not and could not make the tick tenant-neutral. That is ruling
127's item, and it survives P4.

## Findings — reported, NOT fixed

1. **Every capture on the platform host logs an ERROR-severity line**
   (`[tenant-scope] refusing scoped access: host "psychefolio.com"`), from the
   capture path and from notify's identity resolution. Both are working as
   designed, but they log as errors on a path that is now normal, and anyone
   reading production logs will read them as breakage.
2. **`content/site-content.ts:15`** falls back to a hardcoded
   `https://valentinavelez.com` for the host-agnostic static `/sitemap.xml` and
   `/robots.txt`. Same family as `staticSiteTenant()`, same P5 question.
3. **Three "global by intent, scoped by accident" reads remain** — the account
   email-change check, its confirm step, and invite acceptance. Enumerated in the
   hotfix report; they want one fix together.

## Sweep

**42/42, `SWEEP EXIT: 0`.** `platform-frontdoor` 16/16 — the front doors, the
welcome email's full identity, A1's button, and the attribution positive control
in one run.
