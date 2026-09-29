# C40-APPOINTMENT-REQUESTS

**Status:** spec, awaiting ratification. Nothing built.
**Covers:** item 1 (request-and-approve) and item 3 (notification preferences).
**Does not cover:** item 2 (practitioner-offered alternatives — waits on Jacob's
Zoom answer, ruling 221), item 4 (calendar read-back — C41, ruling 222), Zoom,
any change to C37's webhook behaviour.
**Governing rulings:** 219–223. Ruling 223 (Jacob): requests BLOCK the slot,
with a 48-hour expiry.

Every claim below is against code read on 2026-09-29, quoted where it governs.

---

## 0. The three findings that shape everything

**0.1 Booking creates money and mail in one call.** `lib/appointments.ts:84-93`:

```ts
const appt = await prisma.appointment.create({ data: { … } });
await createChargeForAppointment(appt);   // money
await notify(appt.id, "booked");          // both parties, with an .ics
return { ok: true, appointment: appt };
```

A request must do neither. So the request path cannot be "createAppointment
with a different status" — it must be a *separate* write that stops before
line 90, and *approval* must be the thing that runs lines 90-91.

**0.2 "Busy" is defined in THREE places, not two.** The dispatch named two;
tracing found a third, inside `generateSlots`, which re-filters the array
`openSlots` has already fetched:

| where | code | role |
|---|---|---|
| `lib/schedule.ts:350` `hasConflict` | `status: "SCHEDULED"` | the write-path guard |
| `lib/schedule.ts:310` `openSlots` | `where: { …, status: "SCHEDULED", … }` | the fetch |
| `lib/schedule.ts:228` `generateSlots` | `.filter((a) => a.status === "SCHEDULED")` | re-filter of that fetch |

Widening :310 without :228 is a no-op — the fetched requests are dropped a
line later. All three move together, to `status: { in: ["SCHEDULED", "REQUESTED"] }`.

**0.3 A request the client cannot see is a request that gets made twice.**
`app/space/schedule/page.tsx:78` lists the client's upcoming sessions with
`status: "SCHEDULED"`. Left alone, a client who requests a slot sees nothing on
their own schedule, assumes it failed, and requests again. That page must show
requests, labelled as such.

---

## 1. Item 1 — request-and-approve

### 1.1 States

```prisma
enum AppointmentStatus {
  SCHEDULED  COMPLETED  CANCELLED  NO_SHOW   // unchanged
  REQUESTED                                  // new: held, awaiting her
  DECLINED                                   // new: she said no
  EXPIRED                                    // new: 48h passed, ruling 223
}
```

**Why statuses and not a soft delete for DECLINED/EXPIRED.** Three reasons,
and the first is the strong one. (i) `hasConflict` and `openSlots` filter by
status, so a declined row with any *other* status is automatically not busy —
a soft-delete flag would need adding to all three busy sites as a second
condition, which is exactly the class of "widen two, forget the third" mistake
0.2 found. (ii) A cancellation is context, not absence (C37 kept CANCELLED
rows for the same reason); "she declined Tuesday twice" is a fact a
practitioner later wants. (iii) `CANCELLED` is a precedent: this codebase
already records outcomes as status, and the client's cancel/reschedule pages
gate on `status !== "SCHEDULED"` — DECLINED and EXPIRED fall through those
gates correctly with zero changes.

### 1.2 The request write

New `requestAppointment(args)` in `lib/appointments.ts`, beside
`createAppointment`. It runs the SAME preamble — `getOrCreateConfig`,
`hasConflict` — and writes `status: "REQUESTED"`, `bookedBy: "client"`. It
does NOT call `createChargeForAppointment`, does NOT call `notify("booked")`,
and does NOT attach a video URL yet (the room is committed on approval, so a
declined request never leaked a meeting link).

It sends one thing: the practitioner-facing "new request" notification (item
3, §2.3). Nothing to the client beyond the page they are looking at.

### 1.3 Approval goes THROUGH the booking path, never beside it

`approveRequest(appointmentId, practitionerId)`:

1. Load the row; refuse unless `status === "REQUESTED"`.
2. **Re-check availability**, per Q7 item 5: `hasConflict(…, ignoreAppointmentId: appointmentId)`.
   Ruling 223 makes the request itself busy, so it must be ignored on
   re-check or it conflicts with itself. C37 bookings that arrived in the
   meantime ARE `SCHEDULED` and DO surface here. External calendars are C41;
   this spec leaves the hook — the re-check is one function call, and C41
   extends `hasConflict`, not this.
3. On conflict: the request stays `REQUESTED`, she is told the slot is gone,
   and decline is offered. It is not auto-declined — that is her call.
4. Otherwise: **the exact tail of `createAppointment`**, extracted into a
   shared `confirmAppointment(appt)`:
   ```ts
   // one function, two callers: createAppointment and approveRequest
   async function confirmAppointment(appt) {
     videoUrl / videoProvider  ← same derivation as today
     status: "SCHEDULED"
     await createChargeForAppointment(appt);
     await notify(appt.id, "booked");        // .ics attached, both parties
   }
   ```
   `createAppointment` becomes create-then-`confirmAppointment`. Approval is
   update-then-`confirmAppointment`. Charge, notifications and .ics happen in
   the same order from the same code, by construction — the dispatch's
   requirement that booking logic is not duplicated is met by there being one
   copy.

### 1.4 Decline

`declineRequest(appointmentId, practitionerId, note?)` → `status: "DECLINED"`,
`notify(appointmentId, "declined")`. `NotifyKind` gains `"declined"` and
`"expired"` (today: `"booked" | "rescheduled" | "cancelled"`, `:323`). No
charge, no .ics. Copy is Jacob's — placeholder in `lib/email-copy.ts`:

> `[JACOB — decline copy. Placeholder: "{practitioner} isn't able to take
> {when}. You're welcome to request another time."]`

### 1.5 Expiry — the tick, ruling 223

New step in `app/api/jobs/tick/route.ts`, after auto-complete:

```ts
// N. Expire stale requests (C40, ruling 223): REQUESTED and older than 48h
//    since createdAt → EXPIRED, slot freed, client told. Idempotent: the
//    status change is the mark.
const stale = await prisma.appointment.findMany({
  where: { status: "REQUESTED", createdAt: { lt: new Date(now.getTime() - 48 * 3_600_000) } },
  take: 100,
});
for (const a of stale) {
  await prisma.appointment.update({ where: { id: a.id }, data: { status: "EXPIRED" } });
  await notify(a.id, "expired");
  expired++;
}
report.requestsExpired = expired;   // ← named in the [tick] line
```

**Ruling 112's shape, answered:** the tick's report line gains
`requestsExpired`, and the C40 gate asserts the field is PRESENT in the
response even when zero — an absent key is a step that did not run, and a
present `0` is a step that ran and found nothing. Those are different facts.

The 48h clock is `createdAt`, not "last viewed": a request she opened and did
not answer still lapses.

**Auto-complete never touches requests.** `:121` filters `status: "SCHEDULED"`
and stays that way; a `REQUESTED` row past its time is expired by this step,
never completed by that one. Gated.

### 1.6 Per-practice setting, default OFF

Key `bookingRequiresApproval`, values `"on" | "off"`, read through
`readPracticeSetting` (the C25 single access point). Absent row = off.

In `app/space/schedule/actions.ts` `bookSlot` (`:21`), the branch is ONE line:

```ts
const result = requiresApproval
  ? await requestAppointment({ …same args… })
  : await createAppointment({ …same args… });
```

Everything above it — consent gate, `isSlotOpen` re-validation, config —
is shared. **A practice with the setting off runs byte-identical logic to
today**; the gate proves it by booking through both branches and diffing the
resulting rows and sent-mail ledger against the pre-C40 shape.

A3 verified: `bookSlot` is already the single client entry; the UI change is
the button label ("Request this time" when on) and the confirmation page
copy ("Requested — {practitioner} will confirm within two days"). One branch,
one label. Not a new flow.

### 1.7 The practitioner surface

A4 verified: **there is an existing "needing motion" pattern** —
`app/practitioner/page.tsx:163-178` pushes `{ text, href }` signals onto her
home (agreements awaiting countersign, notes in the Margins inbox). Requests
join it, above agreements:

```ts
const pendingRequests = await prisma.appointment.count({ where: { status: "REQUESTED" } });
if (pendingRequests > 0) signals.push({
  text: pendingRequests === 1 ? "One session request is waiting for your answer."
                              : `${pendingRequests} session requests are waiting for your answer.`,
  href: "/practitioner/schedule?show=requests",
});
```

`/practitioner/schedule` gains a `?show=requests` view listing REQUESTED rows
with client, time, their note, time remaining before expiry, and two
`PendingButton`s: Approve / Decline. Its `:60` and `:77` queries are widened so
requests render in the day view too, visually distinct (dashed outline, "Requested").

`app/practitioner/page.tsx:376` (today's sessions) stays `SCHEDULED`-only: a
request is not a session on her day; it is a signal on her desk.

### 1.8 C37 interaction — stated explicitly

External bookings are written `status: "SCHEDULED"` at
`lib/scheduling/external/ingest.ts:138,160` and are **never REQUESTED**. The
practitioner's own scheduler already confirmed them; asking her to approve a
Calendly booking she configured would be asking twice. `bookingRequiresApproval`
does not apply to the ingest path, and the C40 gate asserts an external
booking lands SCHEDULED with the setting ON.

Symmetrically, a practitioner-made booking (`bookedBy: "practitioner"`,
`app/practitioner/clients/[clientId]/actions.ts:213`) is never a request.
Requests are client-initiated only.

### 1.9 Every `"SCHEDULED"` literal, classified (A2)

Product code has 33 reads of the literal. Each is one of:

- **WIDEN to include REQUESTED (the busy set + the client's own view):**
  `lib/schedule.ts:228, :310, :350` · `app/space/schedule/page.tsx:78` ·
  `app/practitioner/schedule/page.tsx:60, :77`
- **UNCHANGED, correct as SCHEDULED-only:** tick `:121` auto-complete, tick
  `:250` reminders (a request is not a session yet), `app/practitioner/page.tsx:376`
  today-view, the `.ics` feed `:37` (a request is not on her calendar until
  approved), billing/recording/remarkable (`billing.ts:195`, `recording.ts:228`,
  `remarkable.ts:150`, `billing-dashboard.ts`), the cancel/reschedule guards
  (`space/schedule/{cancel,reschedule}` — a client withdraws a request through a
  new "withdraw" action, not the cancel-with-policy path, because no charge
  exists to refund), discovery (`lib/discovery.ts` — DISCOVERY has its own
  lifecycle and is out of scope).

**Gates (A2):** no audit file references the literal `"SCHEDULED"` — I grepped
`audits/` and got zero. The five gates that touch `appointment.*` at all
(`external-verify`, `discovery-verify`, `phase4`, `platform/verify`,
`remarkable-recording`) assert on `externalId`/`clientId`/existence, not on
status counts. **No pinned count moves.** The only count that changes is the
`AppointmentStatus` enum's length, which nothing pins.

### 1.10 A1 — the enum migration, verified

Three prior migrations added enum values in production through
`prisma migrate deploy` (`14_c15_messaging`, `20_amd05_packages_policy`,
`27_c12x_intelligence`), each a bare `ALTER TYPE … ADD VALUE`. Additive, no
row touched.

**The rule Postgres imposes, and the migration must respect:** a value added
by `ALTER TYPE … ADD VALUE` cannot be *used* in the same transaction that
added it. `migrate deploy` wraps each migration file in one transaction. So
migration 55 contains the three `ADD VALUE` statements and NOTHING that
writes them — no backfill, no default change. All three precedents are
shaped exactly that way, which is why they worked.

---

## 2. Item 3 — notification preferences

### 2.1 What exists (rulings 219/220, for the record)

- **24h client reminder**: tick `:249`, every 15 min, email + push to the
  client, `reminderSentAt` dedup, no toggle. Excludes `kind: DISCOVERY` and
  null `clientId` — i.e. every C37 booking.
- **Push**: `lib/push.ts`, complete. Three senders, all to the client.
  Subscribing needs a session (`app/api/push/route.ts`); a practitioner CAN
  subscribe; nothing sends to her.
- `autoPayReminders`: one reader (tick `:295`), **zero writers**.

### 2.2 The keys

All through `readPracticeSetting` / `writePracticeSetting`. Value is one of
`"push" | "email" | "both" | "off"`.

| key | who receives | default | note |
|---|---|---|---|
| `notify.request.new` | practitioner | `both` | item 1's inbound |
| `notify.request.outcome` | client | `email` | approved / declined / expired |
| `notify.reminder.1d.client` | client | **`both`** | **= today's behaviour; absent row must fire exactly as now** |
| `notify.reminder.1d.practitioner` | practitioner | `off` | NEW recipient; off until she opts in |
| `notify.reminder.30m.client` | client | `off` | NEW window |
| `notify.reminder.30m.practitioner` | practitioner | `off` | NEW window, NEW recipient |
| `autoPayReminders` | (money nudges) | `off` | **gets its missing writer** — a toggle in this section. The dead read becomes live. |

**The invariant the gate proves:** with NO C40 rows present, the tick's
reminder step sends exactly what it sends today — same recipients, same
channels — measured against a fixture run on the pre-C40 tick. The new keys
add; their absence changes nothing.

### 2.3 Precision, stated honestly

The tick runs every 15 minutes (confirmed live, `[tick]` at :00/:15/:30/:45).
A "30 minutes before" reminder is therefore delivered **between 30 and 45
minutes before** the session, never later than 30. The settings page says
"about 30 minutes before". The 24h reminder has the same ±15 min and always
did.

Implementation: a second `reminder30SentAt` column beside `reminderSentAt`
(additive), a second tick query with the window `startAt ∈ (now+15m, now+45m]`
so a 15-minute cadence cannot skip a session.

### 2.4 C37 bookings — decided, not silently extended or excluded

**They get the 30-minute reminder to the practitioner and nothing to the
client.** Reasoning: the client of a Calendly booking is a Lead, not a User
— no login, no push subscription, and their email was given to Calendly,
which is already reminding them. Sending a second reminder from an address
they never saw is the kind of surprise ruling 197 exists to prevent. The
practitioner, though, has a session on her calendar and no in-app nudge for
it today; the 30m practitioner reminder is the one that helps her most for
exactly these bookings. The 24h client step stays `kind: SESSION` /
`clientId not null` as it is.

### 2.5 The practitioner's push opt-in

`PushSubscription` is per-user; she subscribes exactly as a client does
(`POST /api/push`, session-gated). The settings section carries an "Enable
push on this device" control that runs the existing service-worker subscribe
flow. States she can see:

- **Not asked yet** → the button.
- **Granted** → "Push is on for this device", and per-toggle "push" options are live.
- **Browser refused / permission denied** → "Your browser has blocked
  notifications for this site. Email will still work." — the push half of
  every toggle is shown disabled with that reason; nothing silently falls
  back, nothing is silently dropped. `lib/push.ts` already treats zero
  subscriptions as a no-op, so "both" with no device delivers email only,
  and the page says so.

### 2.6 Where it lives (Q4)

`/practitioner/settings/notifications`, the C37 pattern exactly: one `LinkRow`
on `/practitioner/settings` (two i18n keys, both locales, declared in
`settings-i18n-verify`'s `NEW_SINCE_PASS` with this build's name), one page,
one `actions.ts` writing through `writePracticeSetting`.

---

## 3. What the gate proves (`audits/scheduling/requests-verify.ts`)

Each with its positive control (ruling 110), able-to-fail demonstrated at build.

1. **Two clients cannot hold one slot.** Client A requests 10:00. Client B's
   `openSlots` does not offer 10:00; B's forced `requestAppointment(10:00)`
   returns `conflict`. Positive control: with A's request DECLINED, B's
   request succeeds. This is ruling 223's failure mode, demonstrated impossible.
2. **All three busy sites agree.** A REQUESTED row is absent from `openSlots`,
   blocks `hasConflict`, and is busy in `generateSlots`.
3. **A request creates no charge and sends nothing to the client.** Charge
   count and the sent-mail ledger unchanged after `requestAppointment`;
   exactly one practitioner notification.
4. **Approval creates exactly what booking creates.** Row, charge, mail
   ledger and `.ics` attachment after `approveRequest` are field-identical to
   a direct `createAppointment` of the same slot.
5. **Approval re-checks.** A C37 booking ingested for the slot between request
   and approval → approval returns `conflict`, status stays REQUESTED.
6. **Expiry.** Tick with a 49h-old request → EXPIRED, slot offered again,
   client notified, `requestsExpired: 1` in the response. Tick with none →
   `requestsExpired: 0` **present**. Auto-complete leaves a past REQUESTED
   row untouched.
7. **Setting off = today.** With no `bookingRequiresApproval` row, `bookSlot`
   produces a SCHEDULED row with charge and mail, identical to a pre-C40 fixture.
8. **External stays external.** With the setting ON, a Calendly ingest lands
   SCHEDULED.
9. **Reminder defaults unchanged.** With no `notify.*` rows, the tick's
   reminder step sends to the client on both channels and to the practitioner
   not at all. With `notify.reminder.1d.practitioner = "push"`, she gets one push.
10. **The client sees their request.** `/space/schedule` renders a REQUESTED row.
11. **Every AppointmentStatus is reachable and the enum length is 7** (ruling 38).

---

## 4. Order of work

Migration 55 (enum + `reminder30SentAt`) → `confirmAppointment` extraction
with `createAppointment` proven byte-equivalent BEFORE any request code →
the three busy sites → request/approve/decline/withdraw → tick expiry step →
settings page → client UI branch → gate → sweep.

Item 3 can land in the same build or after item 1; it has no dependency on it
except the `notify.request.*` keys.
