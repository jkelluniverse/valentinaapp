import { randomBytes } from "crypto";
import type {
  SchedulingConfig,
  AvailabilityRule,
  AvailabilityException,
  Appointment,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

// C10 — scheduling core. Times are stored in UTC; the practitioner's timezone
// lives on SchedulingConfig. Slot generation walks civil dates in that timezone
// and converts each candidate wall-clock time to a UTC instant with a
// DST-correct offset, so slots stay right across spring-forward / fall-back.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// Timezone math (no dependency — Intl only)
// ---------------------------------------------------------------------------

// How many minutes `timeZone` is ahead of UTC at `date` (negative when behind).
// Derived by formatting the instant in that zone and reading the wall-clock
// back as if it were UTC; the gap is the offset.
function offsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// A wall-clock time in `timeZone` (civil y/m0/d + minutes past midnight) → the
// UTC instant. Two-pass offset correction handles DST transitions: the first
// guess uses the offset at the naive instant, the second re-checks at the
// corrected instant and re-applies if the offset changed across the boundary.
export function zonedWallToUtc(
  year: number,
  month0: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month0, day, 0, 0) + minutes * 60000;
  const off1 = offsetMinutes(timeZone, new Date(wallAsUtc));
  let utc = wallAsUtc - off1 * 60000;
  const off2 = offsetMinutes(timeZone, new Date(utc));
  if (off2 !== off1) utc = wallAsUtc - off2 * 60000;
  return new Date(utc);
}

// The civil calendar parts of a UTC instant, as seen in `timeZone`.
export function zonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month0: Number(map.month) - 1,
    day: Number(map.day),
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

// Weekday (0=Sun..6=Sat) of a civil date, via pure UTC calendar arithmetic —
// no timezone involved, so it never drifts.
export function civilWeekday(year: number, month0: number, day: number): number {
  return new Date(Date.UTC(year, month0, day)).getUTCDay();
}

// A calm human label for a UTC instant in the practitioner's timezone.
export function formatInZone(
  date: Date,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions & { locale?: string } = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  // AMD-05 — locale-aware dates ("es-419", neutral Latin American Spanish).
  const { locale, ...rest } = opts;
  return new Intl.DateTimeFormat(locale ?? "en-US", { ...rest, timeZone }).format(date);
}

// Short timezone label (e.g. "EDT") for a given instant, for display next to times.
export function zoneAbbrev(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "numeric",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// The single practitioner who owns availability and receives sync + notifications.
// Everything keys by this id, so a second practitioner would just be another row.
export async function getPractitioner() {
  return prisma.user.findFirst({
    where: { role: "PRACTITIONER" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
}

const DEFAULT_TZ = "America/New_York";

// Ensure a config row exists (with an unguessable feed secret). Idempotent.
export async function getOrCreateConfig(practitionerId: string): Promise<SchedulingConfig> {
  const existing = await prisma.schedulingConfig.findUnique({ where: { practitionerId } });
  if (existing) return existing;
  return prisma.schedulingConfig.create({
    data: {
      practitionerId,
      timezone: DEFAULT_TZ,
      calendarFeedSecret: newFeedSecret(),
    },
  });
}

export function newFeedSecret(): string {
  // 32 bytes of base64url — long, unguessable, URL-safe, and rotatable.
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

export type Slot = { startAt: Date; endAt: Date };

type Interval = { start: number; end: number }; // wall minutes from midnight

function sameCivilDate(exDate: Date, y: number, m0: number, d: number): boolean {
  // Exceptions store the civil date as midnight UTC, so compare UTC parts.
  return (
    exDate.getUTCFullYear() === y &&
    exDate.getUTCMonth() === m0 &&
    exDate.getUTCDate() === d
  );
}

// Subtract a [bStart,bEnd) block from a set of availability intervals.
function subtract(intervals: Interval[], bStart: number, bEnd: number): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    if (bEnd <= iv.start || bStart >= iv.end) {
      out.push(iv); // no overlap
      continue;
    }
    if (bStart > iv.start) out.push({ start: iv.start, end: bStart });
    if (bEnd < iv.end) out.push({ start: bEnd, end: iv.end });
  }
  return out;
}

export type SlotInputs = {
  config: SchedulingConfig;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  appointments: Pick<Appointment, "startAt" | "endAt" | "status">[];
  from: Date; // window start (UTC); usually now
  to: Date; // window end (UTC)
  now: Date; // for min-notice
  durationMinutes?: number; // C18 — slot length; defaults to config.sessionMinutes
};

// C18 — which kind of booking a slot query is for. SESSION reuses the standard
// session hours + length; DISCOVERY uses the separate discovery hours + length.
export type BookingKind = "SESSION" | "DISCOVERY";

// All bookable slots in [from, to], in the practitioner's timezone, honoring
// availability rules, one-off openings/blocks, min-notice, max-advance, and
// existing appointments (with buffer). Computed entirely server-side.
export function generateSlots(input: SlotInputs): Slot[] {
  const { config, rules, exceptions, appointments, from, to, now } = input;
  const tz = config.timezone;
  const duration = input.durationMinutes ?? config.sessionMinutes;
  const step = duration + config.bufferMinutes;
  const bufferMs = config.bufferMinutes * 60000;

  const minStart = new Date(now.getTime() + config.minNoticeHours * 3600_000);
  const maxStart = new Date(now.getTime() + config.maxAdvanceDays * DAY_MS);
  const windowEnd = to.getTime() < maxStart.getTime() ? to : maxStart;

  // Busy intervals from live appointments, padded by the buffer so we never
  // book right up against another session.
  const busy = appointments
    .filter((a) => a.status === "SCHEDULED")
    .map((a) => ({
      start: a.startAt.getTime() - bufferMs,
      end: a.endAt.getTime() + bufferMs,
    }));

  const slots: Slot[] = [];
  const start = zonedParts(from, tz);
  // Walk civil dates from `from`'s local date through the window end. Civil-date
  // arithmetic in UTC space keeps the calendar honest across DST.
  for (let i = 0; i < config.maxAdvanceDays + 2; i++) {
    const cal = new Date(Date.UTC(start.year, start.month0, start.day) + i * DAY_MS);
    const y = cal.getUTCFullYear();
    const m0 = cal.getUTCMonth();
    const d = cal.getUTCDate();
    const weekday = civilWeekday(y, m0, d);

    // Stop once this date's midnight is already past the window end.
    const dayStartUtc = zonedWallToUtc(y, m0, d, 0, tz);
    if (dayStartUtc.getTime() > windowEnd.getTime()) break;

    const dayExceptions = exceptions.filter((e) => sameCivilDate(e.date, y, m0, d));
    const fullDayBlock = dayExceptions.some(
      (e) => e.type === "BLOCK" && e.startMinute == null && e.endMinute == null,
    );
    if (fullDayBlock) continue;

    // Availability = recurring rules for this weekday + one-off OPEN windows.
    let intervals: Interval[] = rules
      .filter((r) => r.active && r.weekday === weekday)
      .map((r) => ({ start: r.startMinute, end: r.endMinute }));
    for (const e of dayExceptions) {
      if (e.type === "OPEN" && e.startMinute != null && e.endMinute != null) {
        intervals.push({ start: e.startMinute, end: e.endMinute });
      }
    }
    // Minus one-off partial BLOCKs.
    for (const e of dayExceptions) {
      if (e.type === "BLOCK" && e.startMinute != null && e.endMinute != null) {
        intervals = subtract(intervals, e.startMinute, e.endMinute);
      }
    }
    if (intervals.length === 0) continue;
    intervals.sort((a, b) => a.start - b.start);

    for (const iv of intervals) {
      for (let m = iv.start; m + duration <= iv.end; m += step) {
        const slotStart = zonedWallToUtc(y, m0, d, m, tz);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);
        if (slotStart.getTime() < minStart.getTime()) continue;
        if (slotStart.getTime() < from.getTime()) continue;
        if (slotStart.getTime() > windowEnd.getTime()) continue;
        const clashes = busy.some(
          (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start,
        );
        if (clashes) continue;
        slots.push({ startAt: slotStart, endAt: slotEnd });
      }
    }
  }
  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return slots;
}

// Load everything slot generation needs and return the open slots for a window.
// `kind` (C18) selects session vs discovery hours + length. Busy intervals come
// from ALL scheduled appointments regardless of kind, so a discovery call can
// never overlap a session and vice-versa.
export async function openSlots(
  practitionerId: string,
  from: Date,
  to: Date,
  now: Date,
  kind: BookingKind = "SESSION",
): Promise<{ config: SchedulingConfig; slots: Slot[] }> {
  const config = await getOrCreateConfig(practitionerId);
  const [rules, exceptions, appointments] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { practitionerId, kind } }),
    prisma.availabilityException.findMany({
      where: { practitionerId, date: { gte: startOfCivilDay(from), lte: to } },
    }),
    prisma.appointment.findMany({
      where: { practitionerId, status: "SCHEDULED", endAt: { gte: from }, startAt: { lte: to } },
      select: { startAt: true, endAt: true, status: true },
    }),
  ]);
  const durationMinutes = kind === "DISCOVERY" ? config.discoveryMinutes : config.sessionMinutes;
  const slots = generateSlots({ config, rules, exceptions, appointments, from, to, now, durationMinutes });
  return { config, slots };
}

function startOfCivilDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Server-side re-validation used at booking time: is this exact start still an
// open, on-grid slot? Guards against races and hand-crafted requests.
export async function isSlotOpen(
  practitionerId: string,
  startAt: Date,
  now: Date,
  kind: BookingKind = "SESSION",
): Promise<boolean> {
  const from = new Date(startAt.getTime() - DAY_MS);
  const to = new Date(startAt.getTime() + DAY_MS);
  const { slots } = await openSlots(practitionerId, from, to, now, kind);
  return slots.some((s) => s.startAt.getTime() === startAt.getTime());
}

// Whether a proposed [startAt, endAt] overlaps any live appointment (buffer
// applied). Used for practitioner "any time" bookings that bypass the grid.
export async function hasConflict(
  practitionerId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number,
  ignoreAppointmentId?: string,
): Promise<boolean> {
  const bufferMs = bufferMinutes * 60000;
  const clash = await prisma.appointment.findFirst({
    where: {
      practitionerId,
      status: "SCHEDULED",
      ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
      startAt: { lt: new Date(endAt.getTime() + bufferMs) },
      endAt: { gt: new Date(startAt.getTime() - bufferMs) },
    },
    select: { id: true },
  });
  return clash != null;
}
