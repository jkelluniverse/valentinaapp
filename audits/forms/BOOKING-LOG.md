# C42-PRACTITIONER-FORMS acceptance — 2026-10-06T20:40:08.609Z
SCOPE: host c42a.c42.test · viewport 1280×900 (form logic, not layout) · HTTP on :3192 + a real Chromium on the tenant host + in-process · local build fea39f6. NOT covered: production, real mail delivery, the builder's autosave inputs, mobile layout of /book (C18's baseline), any surface not named in a leg (ruling 208).

## In-process — the pure pieces
- ✓ 3: a schema claiming id "email" is refused with the id named
- ✓ 3: positive control — a schema with no structural id is accepted
- ✓ 2 (unit): firstMissingRequired names the first blank REQUIRED field, treating whitespace as blank
- ✓ 2 (unit): …and null when every required field is answered
- ✓ 7: normaliseCalendly yields { "ext:1": { q, a } } — keyed ext:<n>, q verbatim, a blank question gets a numbered q — {"ext:1":{"q":"What brings you here?","a":"Sleep."},"ext:2":{"q":"Question 2","a":"second"}}
- ✓ 8: parseFields equals the pre-C42 filter on EVERY stored worksheet (1 rows) — 1/1
- ✓ 8: positive control — a malformed labels value is dropped and the field KEPT; a well-formed one survives
- ✓ 5 (unit): fieldLabel falls back to English when es is absent, and uses es when present
- ✓ 6 (static): setBookingWorksheet is the isIntake transaction — clear all, then set one

## 1 — defaults are today (no booking worksheet exists)
- ✓ fixture: the practice has NO isBooking worksheet
- ✓ 1: the EN form is field-for-field the pre-C42 form (ids, tags, types, order, optionality, labels, placeholder) — [{"id":"name","tag":"input","type":null,"required":true,"label":"Your name","placeholder":null},{"id":"email","tag":"input","type":"email","required":true,"label":"Email","placeholder":null},{"id":"phone","tag":"input","type":"tel","required":false,"label":"Phone · optional","placeholder":null},{"id
- ✓ 1: the submission books (lands on /book/confirmed) and writes ONE Lead — /book/confirmed?t=cmux57jtf0001lb6jbttxqo6n.fXhIDokjyG9iIeALWEGMl8xzmXW1zWVPMLVwBWWPACw
- ✓ 1: the four pre-C42 Lead columns carry the typed values
- ✓ 1: the snapshot carries the two defaults under their ids with q = the label as rendered — {"note":{"a":"Just curious.","q":"What brings you?"},"phone":{"a":"555-0100","q":"Phone"}}
- ✓ 1: the ES form carries the catalogue's Spanish labels for all four (ruling 233's defect closed for these fields) — [{"id":"name","tag":"input","type":null,"required":true,"label":"Tu nombre","placeholder":null},{"id":"email","tag":"input","type":"email","required":true,"label":"Correo electrónico","placeholder":null},{"id":"phone","tag":"input","type":"tel","required":false,"label":"Teléfono · opcional","placeho
- ✓ 1: an ES submission stores q in Spanish (Rule 0.8 — what THIS person was asked) — {"note":{"a":"Curiosidad.","q":"¿Qué te trae por aquí?"}}

## 2 — required is enforced by the server, not the attribute
- ✓ builder's first visit creates the booking worksheet FROM THE DEFAULT (same two fields), flagged isBooking, in the tenant
- ✓ …and a second visit returns the SAME worksheet (idempotent)
- ✓ 2: her flip renders — note is now required on /book (the attribute is emitted for the experience)
- ✓ 2: attribute stripped, note omitted → refused with error=missing&field=note — /book?error=missing&field=note
- ✓ 2: …and NOTHING was written
- ✓ 2: positive control — the same POST with the answer is accepted — /book/confirmed?t=cmux57tlg0009lb6jxyjkr2sd.6l4_Fzeod-jePNKOqrh-l-dc-ReLI_UbMRt3nOPeqok
- ✓ 2: the refusal's page copy names the problem (not the pre-C42 'add your name' text)

## 3 — structural fields cannot be removed or doubled
- ✓ 3: a hand-written schema claiming id "email" renders exactly ONE email input (the structural one) and no second
- ✓ 3: a POST without email is refused at the pre-C42 check (error=missing, no field) — /book?error=missing
- ✓ 3: an EMPTY schema renders name + email only and still books — /book/confirmed?t=cmux580br000dlb6j9wr80kxc.8NCtxXvBkACE6cQlUed1mm6Ss_TjDeyTToTrpTQfB6U
- ✓ 3: …with phone/note null and an empty snapshot (nothing was asked)

## 4 — snapshots survive edits (Rule 0.8)
- ✓ 4: booked under L1 — stored q is L1
- ✓ 4: after the rename, the FIRST lead's stored q is still L1; the new lead's is L2
- ✓ 4: the leads page shows BOTH questions as asked — L1 for the first lead, L2 for the second (q, never the live label) — 5 answer blocks
- ✓ 4: positive control — the leads page is hers (200, signed in), not the login page

## 5 — Spanish falls back to English until she adds a label
- ✓ 5: en-only field requested in es → the English label renders (fallback), the structural labels are Spanish
- ✓ 5: with es set → the Spanish label renders
- ✓ 5: …and the stored q is the Spanish text this person was asked
- ✓ 5: positive control — the same field in EN still renders the English label

## 6 — exactly one booking form, through the real library sheet
- ✓ 6: 'Set as booking form' on B (driven in the browser) sets B and CLEARS A — exactly one — ui=true listed=1 B=true A=false
- ✓ 6: exactly one isBooking worksheet in the tenant
- ✓ 6: positive control — /book now renders B's question, not A's

## 7 — C37's answers and hers, both on one Lead
- ✓ 7: the external booking landed (200) on the SAME lead (one row for that email) — 200
- ✓ 7: her form's answer AND Calendly's are both on the lead — neither overwrote the other — {"ext:1":{"a":"Sleep.","q":"What brings you here?"},"c42-q1":{"a":"Trabajo.","q":"Cuéntame un poco de lo que está pasando"}}
- ✓ 7: the leads page shows the external answers under their own 'From Calendly' heading — appointmentId=cmux58f8e000dixse6tyqhshk provider=calendly ext=true heading=From Calendly | sofia@c42.stranger.test Cuéntame un poco de lo que está pasando Trabajo. From Calendly What brings you here? Sleep. <button type="b
- ✓ 7: positive control — a later external booking REFRESHES the ext block and still keeps hers

## §2.7 — the entry points exist and are gated behind isBooking
- ✓ settings lists 'Booking questions' → /practitioner/settings/booking-questions
- ✓ the entry route redirects to the booking worksheet's builder — 307 /practitioner/worksheets/cmux57ncv000bixsedu3p03hg
- ✓ the builder shows the two locked structural lines, the Spanish label input and 'Preview as a visitor' → /book
- ✓ positive control — an ordinary worksheet's builder has NONE of them (additive, gated)
- ✓ the server log carries no 'Invalid Server Actions request' and no unhandled Error during the walk — 0

ALL CHECKS PASS
