# C40-APPOINTMENT-REQUESTS acceptance — 2026-10-06T20:39:53.519Z
SCOPE: hosts c40a.c40.test, c40b.c40.test · HTTP on :3186 + in-process service calls · local build. NOT covered: production, real mail/push delivery, any surface not named in a leg (ruling 208).
- ✓ fixture: the practitioner has open SESSION and DISCOVERY slots — 56/112

## 11 — the enums (ruling 38)
- ✓ AppointmentStatus has 7 values — SCHEDULED,COMPLETED,CANCELLED,NO_SHOW,REQUESTED,DECLINED,EXPIRED
- ✓ LeadStatus has 6 values — NEW,REQUESTED,SCHEDULED,COMPLETED,CONVERTED,CLOSED

## 1–3 — a request holds the slot (ruling 223), creates no money, mails only her
- ✓ A's request is created REQUESTED
- ✓ 3: no charge was created
- ✓ 3: no video link was committed
- ✓ 3: exactly ONE mail attempt (the practitioner's) — the client heard nothing — 1 attempt(s)
- ✓ 1/2: openSlots (and generateSlots' re-filter) no longer offer A's slot to B
- ✓ 2: hasConflict treats the request as busy
- ✓ 1: B's forced request for the same slot is REFUSED (conflict)
- ✓ 1: still exactly one appointment row for that slot
- ✓ positive control: A's request DECLINED (a status, not a deletion)
- ✓ positive control: with A declined, B's request for the slot SUCCEEDS

## 4–5 — approval runs the booking tail; approval re-checks
- ✓ 4: approval -> SCHEDULED with the standing room attached
- ✓ 4: approval and a direct booking create the SAME charge delta — approve +0, direct +0
- ✓ 4: …and the SAME number of mail attempts (both parties) — approve 2, direct 2
- ✓ 4: …and the same status/videoProvider shape
- ✓ 5: a booking that landed meanwhile makes approval return conflict
- ✓ 5: …and the request STAYS requested (her call, not auto-declined)

## 6 — expiry (ruling 223), named in the tick's report
- ✓ a 49h-old request is expired by the step (returns 1) — 1
- ✓ …its status is EXPIRED
- ✓ …the slot is offered again
- ✓ …and the client was told (one mail attempt)
- ✓ positive control: with nothing stale the step returns 0, not an absence
- ✓ 6: the tick's report carries requestsExpired (ruling 112: present, even at 0) — 0
- ✓ 6: …and reminders30 (item 3's new step is wired) — 0
- ✓ 6: auto-complete leaves a past REQUESTED row untouched (expiry owns it, by createdAt)

## 7 + 12 — setting OFF is today; ruling 224 OFF state
- ✓ 12 OFF (rendered): the submit reads "Confirm my call" and no note is shown — label="Confirm my call" note=false
- ✓ 7 OFF: /book books at once — appointment SCHEDULED, Lead SCHEDULED — lead=SCHEDULED appt=SCHEDULED landed=/book/confirmed?t=cmux57902000110741frg1l2v.JoV7dKSiwvsRHM-v8DwvVPUy2sAGbl6cr0Zaiq0nfEE
- ✓ 7 OFF: the landing page says the call is BOOKED — /book/confirmed?t=cmux57902000110741frg1l2v.JoV7dKSiwvsRHM-v8DwvVPUy2sAGbl6cr0Zaiq0nfEE

## 12 + 13 + 8 — setting ON: ruling 224, the public double-hold, external stays external
- ✓ 12 ON es: "Solicitar mi llamada" + the note in Spanish
- ✓ 12 ON (payload): "Confirm my call" is absent from the ON page entirely — the server sends only the mode's copy
- ✓ 12 ON (rendered): the submit reads "Request my call" and the note IS shown — label="Request my call" note=true
- ✓ 13: through /book, a request lands REQUESTED with Lead REQUESTED — lead=REQUESTED appt=REQUESTED landed=/book/confirmed?t=cmux57coy00051074mgmhe029.TpmNAldhqJXaFn6LorEXw6ekCCtDtvptCUHi58lwb94
- ✓ 12 ON: the landing page says REQUESTED, not booked
- ✓ 13: a second stranger is NOT offered the held slot (openSlots, which /book renders, excludes it) — held=2026-10-07T17:00:00.000Z
- ✓ 13: …while other slots are still offered (positive control) — 10 buttons; 0 chars
- ✓ 13: exactly one appointment holds that slot
- ✓ 8: with the setting ON, an external booking lands SCHEDULED — never REQUESTED — SCHEDULED

## 10 + 12 — the signed-in client sees the request; the session confirm page's label
- ✓ 10: /space/schedule renders the client's REQUESTED row(s) — 0 pending; marker absent
~ confirm-page slot 2026-10-13T20:00:00.000Z · isSlotOpen in-process: true · 51 open
~ tenant seen by a raw fetch on c40a.c40.test: {"kind":"tenant","isDefault":false} · practitioner in T: cmux573uo000413tljhyu5m1d · users in T: 3
~ session confirm (ON): http 200 url=/space/schedule/confirm?start=2026-10-13T20%3A00%3A00.000Z title=Veritas cookie=yes
~ session confirm (ON) body:  Veritas veritas ✧ B veritas ✧ Home Path Reflect Messages Your First Map Your journey Your design Your reading Sessions Settings Profile B Sign out Sessions Confirm your session Tuesday, October 13 at 4:00 PM EDT 50 minutes · virtual session Anything you&#x27;d like to focus on? (optional) Request this session Pick another time Your request goes to your practitioner to confirm. You&#x27;ll get an email when it&#x27;s
- ✓ 12 ON (session): "Request this session" + note; "Confirm booking" absent
- ✓ 12 OFF (session): "Confirm booking", no note

## 9 — item 3 defaults are today's behaviour
- ✓ no notify.* rows: client 1d reminder = email + push (what fired before C40)
- ✓ no notify.* rows: practitioner 1d = OFF (a new recipient waits for consent)
- ✓ no notify.* rows: 30-minute = OFF
- ✓ positive control: a row flips it — practitioner 1d = push only

~ decline copy is a labelled placeholder awaiting Jacob: PRESENT (expected until he rules)

ALL CHECKS PASS
