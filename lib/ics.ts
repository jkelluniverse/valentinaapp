import type { Appointment } from "@prisma/client";

// iCalendar (RFC 5545) generation. Two shapes: a subscription feed of all the
// practitioner's upcoming appointments, and a single-event invite attached to a
// booking email so one appointment is one-tap-addable before the feed refreshes.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// A UTC Date → "YYYYMMDDTHHMMSSZ" (iCal UTC form).
export function icsStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Escape per RFC 5545 §3.3.11 and fold long lines to <=75 octets.
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  status?: "CONFIRMED" | "CANCELLED";
  stamp: Date; // DTSTAMP / last-modified marker
};

function eventLines(e: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsStamp(e.stamp)}`,
    `DTSTART:${icsStamp(e.start)}`,
    `DTEND:${icsStamp(e.end)}`,
    `SUMMARY:${esc(e.summary)}`,
    `STATUS:${e.status ?? "CONFIRMED"}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(events: IcsEvent[], name = "Veritas sessions"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Veritas//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// A single .ics invite for a booking email.
export function buildInvite(event: IcsEvent): string {
  return buildCalendar([event]);
}

// Turn an appointment (+ the client's display label) into an ICS event. The
// summary carries the client's first name only; no notes leak into the calendar.
export function appointmentEvent(
  appt: Pick<
    Appointment,
    "id" | "startAt" | "endAt" | "status" | "location" | "videoUrl" | "updatedAt"
  >,
  clientLabel: string,
): IcsEvent {
  const cancelled = appt.status === "CANCELLED";
  const place =
    appt.location === "VIRTUAL" ? appt.videoUrl || "Virtual session" : "In person";
  return {
    uid: `appt-${appt.id}@veritas`,
    start: appt.startAt,
    end: appt.endAt,
    summary: `Session · ${clientLabel}`,
    description: appt.location === "VIRTUAL" && appt.videoUrl ? `Join: ${appt.videoUrl}` : undefined,
    location: place,
    status: cancelled ? "CANCELLED" : "CONFIRMED",
    stamp: appt.updatedAt,
  };
}
