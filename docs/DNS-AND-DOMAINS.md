# DNS AND DOMAINS — operational truth

> ## ⛔ NEVER ENABLE RAILWAY EMAIL FORWARDING ON psychefolio.com (ruling 99)
> Railway's "email forwarding" feature adds seven records at the domain apex and
> **refuses a mail exchange record for another provider at the apex** (Railway's own
> docs). psychefolio.com's mail is Zoho. Enabling forwarding is structurally
> incompatible with it and takes Jacob's mail down. This is standing and load-bearing.
>
> ## ⛔ NEVER PUT A LITERAL CNAME AT THE APEX OF A MAIL-BEARING DOMAIN (ruling 71)
> A true CNAME coexists with no other record type (RFC 1912), so an apex CNAME
> shadows the MX records and breaks mail. Apex routing uses ALIAS/ANAME or a
> provider's flattened-CNAME, never a literal CNAME.

**If you are clicking through Railway's domain UI right now, read the two boxes above
first.** Railway exposes no place to annotate its own dashboard, so this file is the
record; the same two warnings belong in the Railway project's description field, which
only a human with dashboard access can set (text to paste is at the bottom).

## Who holds what (ruling 98 — this fact has moved three times, so it is written down)

- **psychefolio.com is REGISTERED through Railway. Its DNS ZONE lives at name.com.**
  Nameservers (verified live 2026-09-17):
  `ns1kpv.name.com · ns2cvx.name.com · ns3gnv.name.com · ns4fpy.name.com`.
  "Railway manages the DNS" is true only in the sense that the domain was bought via
  Railway. Every record is created and edited in the **name.com** zone.
- **Railway's domain flow creates no DNS records.** Adding a custom domain yields a
  CNAME **value** (e.g. `xxxxxx.up.railway.app`) plus a **TXT** verification record,
  both of which a human adds at name.com. Without the TXT, the domain returns 404
  even after the CNAME resolves (Railway docs).
- Railway supports **CNAME flattening and dynamic ALIAS records** for a root/apex
  domain. Which record TYPE is available is a name.com question, not a Railway one.

## Live baseline — psychefolio.com, verified 2026-09-17 (DoH, before any P2 change)

| Record | Value |
| --- | --- |
| MX | `10 mx.zoho.com.` · `20 mx2.zoho.com.` · `50 mx3.zoho.com.` |
| TXT (apex) | `v=spf1 include:zohomail.com ~all` · `zoho-verification=zb92347281.zmverify.zoho.com` |
| `_dmarc` TXT | `v=DMARC1; p=none;` |
| NS | `ns1kpv` · `ns2cvx` · `ns3gnv` · `ns4fpy` `.name.com.` |
| A (apex) | **NONE** — the apex does not route today |
| `send.` CNAME | `send.forge.rmta.net.` — Resend's DELEGATED subdomain, its own SPF/MX; untouched by anything at the apex |
| `www.psychefolio.com` | routes, HTTP 200 — served by the `*.psychefolio.com` wildcard |

Exactly **one** `v=spf1` record exists at the apex and there must never be a second:
Zoho runs the apex, Resend runs `send.`, and two SPF records at one name is a permerror.

Railway custom domains on the production service (`valentinaapp`): `valentinavelez.com`
and `*.psychefolio.com`, both target port 8080. **The wildcard does not cover the bare
apex** — `*.psychefolio.com` matches `x.psychefolio.com`, not `psychefolio.com`.

For contrast, valentinavelez.com's apex already routes via a flattened CNAME
(`lsvhy2j8.up.railway.app` + A `69.46.46.50`) — the same shape the psychefolio apex
would need.

## Adding the apex (P2.1) — the procedure, MX-first

1. **Quote the live MX records** (`curl -sS "https://dns.google/resolve?name=psychefolio.com&type=MX"`).
   This is the before-state and it is quoted in the report, not summarized.
2. Add `psychefolio.com` as a custom domain on the production service, port 8080.
   Railway returns a CNAME value and a TXT verification record.
3. At **name.com**, create: the TXT verification record, and for the apex either
   (a) an **ALIAS/ANAME** record pointing at the Railway value — preferred, coexists
   with MX — or (b) if name.com offers no ALIAS/ANAME type, **do not force it**: use
   a 301 URL-forward from the apex to `www.psychefolio.com`, which already routes.
   A Cloudflare nameserver migration is explicitly NOT on the table (ruling: every
   Zoho record would have to be recreated — mail risk for a cosmetic gain).
4. **Re-quote MX and SPF.** If either changed in any way, revert immediately.
5. **Prove mail by arrival, not by inspection**: send a message to Jacob's
   psychefolio.com mailbox and confirm it lands.

## P2.1 EXECUTED — 2026-09-17 (apex added; MX proven unchanged)

- **Railway custom domain `psychefolio.com` added** to the production `valentinaapp`
  service, target port 8080, domain id `f14e9917-6464-4056-9fce-ce7523c37aed`.
- **Railway required exactly ONE record and issued NO TXT** — because ownership was
  already `verified: true` via the pre-existing `*.psychefolio.com` domain on the
  same service. Required value: **`o0owal2d.up.railway.app`**, which at this apex
  must be entered as an **ANAME**, never a CNAME (ruling 71).
- **The apex went live within ~90 seconds of the domain being added**, with a valid
  Let's Encrypt certificate (`CN=psychefolio.com`) and Railway's edge answering
  (`x-railway-67` header on the HTTP→HTTPS 301). Apex A = `69.46.46.16`, TTL 60,
  and **no CNAME at the apex**. Who entered the record is unconfirmed — see the
  report; the builder touched no DNS (Railway creates none: `railwayManaged: false`,
  `currentValue: ""`).
- **Mail safety, quoted before (17:07:35Z) and after (17:10:04Z) — IDENTICAL:**
  MX `10 mx.zoho.com / 20 mx2.zoho.com / 50 mx3.zoho.com`; apex TXT
  `v=spf1 include:zohomail.com ~all` + `zoho-verification=zb92347281.zmverify.zoho.com`
  (exactly one v=spf1); `_dmarc` `v=DMARC1; p=none;`; `send.` CNAME
  `send.forge.rmta.net.` intact. No revert warranted.
- **A literal apex CNAME was available at name.com and was DELIBERATELY DECLINED**
  (name.com's Add Record menu offers A, AAAA, ANAME, CNAME, MX, NS, SRV, TXT). The
  option existed; ANAME was chosen because a CNAME would shadow the Zoho MX.

## Text for the Railway project description (paste verbatim)

```
DNS zone is at name.com, not Railway. NEVER enable Railway email forwarding on
psychefolio.com (it refuses foreign MX at the apex and breaks Zoho mail). NEVER put a
literal CNAME at the apex. See docs/DNS-AND-DOMAINS.md.
```
