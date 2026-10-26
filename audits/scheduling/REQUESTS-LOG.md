# C40-APPOINTMENT-REQUESTS acceptance — 2026-10-26T16:27:37.201Z
SCOPE: hosts c40a.c40.test, c40b.c40.test · HTTP on :3186 + in-process service calls · local build. NOT covered: production, real mail/push delivery, any surface not named in a leg (ruling 208).
- ✓ fixture: the practitioner has open SESSION and DISCOVERY slots — 51/101

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
- ✓ 7 OFF: /book books at once — appointment SCHEDULED, Lead SCHEDULED — lead=SCHEDULED appt=SCHEDULED landed=/book/confirmed?t=cmvpgzvdf000111tevo6fmu9l.mQKIqYoOEapRSio_jAWPJJ61EpWgyBPckWOw-OCSCPE
- ✓ 7 OFF: the landing page says the call is BOOKED — /book/confirmed?t=cmvpgzvdf000111tevo6fmu9l.mQKIqYoOEapRSio_jAWPJJ61EpWgyBPckWOw-OCSCPE

## 12 + 13 + 8 — setting ON: ruling 224, the public double-hold, external stays external
- ✓ 12 ON es: "Solicitar mi llamada" + the note in Spanish
- ✓ 12 ON (payload): "Confirm my call" is absent from the ON page entirely — the server sends only the mode's copy
- ✓ 12 ON (rendered): the submit reads "Request my call" and the note IS shown — label="Request my call" note=true
- ✓ 13: through /book, a request lands REQUESTED with Lead REQUESTED — lead=REQUESTED appt=REQUESTED landed=/book/confirmed?t=cmvpgzz3v000511tepyd8oyn4.2qU_hwfMLvQoaDcN7yLrxHrmCFwn6Ijwu-ALCWRAVjk
- ✓ 12 ON: the landing page says REQUESTED, not booked
- ✓ 13: a second stranger is NOT offered the held slot (openSlots, which /book renders, excludes it) — held=2026-10-27T17:00:00.000Z
- ✓ 13: …while other slots are still offered (positive control) — 10 buttons; 0 chars
- ✓ 13: exactly one appointment holds that slot
- ✓ 8: with the setting ON, an external booking lands SCHEDULED — never REQUESTED — SCHEDULED

## 10 + 12 — the signed-in client sees the request; the session confirm page's label
- ✓ 10: /space/schedule renders the client's REQUESTED row(s) — 0 pending; marker absent
~ confirm-page slot 2026-11-02T16:00:00.000Z · isSlotOpen in-process: true · 46 open
~ tenant seen by a raw fetch on c40a.c40.test: {"kind":"tenant","isDefault":false} · practitioner in T: cmvpgzpx20004967p9sqzy9oc · users in T: 3
~ session confirm (ON): http 200 url=/space/schedule/confirm?start=2026-11-02T16%3A00%3A00.000Z title=Veritas cookie=yes
~ session confirm (ON) body:  Veritas veritas ✧ B veritas ✧ Home Path Reflect Messages Your First Map Your journey Your design Your reading Sessions Settings Profile B Sign out Sessions Confirm your session Monday, November 2 at 11:00 AM EST 50 minutes · virtual session Anything you&#x27;d like to focus on? (optional) Request this session Pick another time Your request goes to your practitioner to confirm. You&#x27;ll get an email when it&#x27;s
- ✓ 12 ON (session): "Request this session" + note; "Confirm booking" absent
- ✓ 12 OFF (session): "Confirm booking", no note

## 9 — item 3 defaults are today's behaviour
- ✓ no notify.* rows: client 1d reminder = email + push (what fired before C40)
- ✓ no notify.* rows: practitioner 1d = OFF (a new recipient waits for consent)
- ✓ no notify.* rows: 30-minute = OFF
- ✓ positive control: a row flips it — practitioner 1d = push only

## 14 — approve at a different time; real decline copy; direct links
- ✓ 14: decline copy is REAL in en — no [JACOB marker, names the time and the practitioner, carries the way back in — Thank you for asking for a time. P isn't able to take W, so that time has been r
- ✓ 14: decline copy is REAL in es — no [JACOB marker, names the time and the practitioner, carries the way back in — Gracias por pedir un horario. P no puede tomar el W, así que ese horario volvió 
- ✓ 14: the discovery path's decline copy is real too (source carries no [JACOB marker)
- ✓ 14: a moved approval's confirmation says FIRST that the time differs (en + es), then the ordinary confirmation
- ✓ 14: positive control — an un-moved confirmation carries no such line
- ✓ 14 (session): approval at another OPEN time moves the row to that time and confirms it — SCHEDULED 2026-11-02T14:00:00.000Z
- ✓ 14 (session): …running the identical booking tail — a charge and both parties' mail — +0 charge, 2 mail
- ✓ 14 (session): …and the requested time is offered again
- ✓ 14 (session): a time NOT on her grid is refused 'unavailable' and the request stays REQUESTED
- ✓ 14 (session): a time taken meanwhile is REFUSED (unavailable — her grid already shows it busy) and the request stays — unavailable
- ✓ 14 (session): positive control — approving the SAME request at its own time still works
- ✓ 14 (discovery): approval at another open time moves the call, confirms it, and the Lead reads SCHEDULED — SCHEDULED lead=SCHEDULED
- ✓ 14 (discovery): a time not on the discovery grid is refused 'unavailable'; the request stays
- ✓ 14: both request emails to her carry the direct link to /practitioner/schedule#requests and name the third option
- ✓ 14: her schedule renders 'Suggest another time' for the pending request, with her open grid as options — 240 options

ALL CHECKS PASS
