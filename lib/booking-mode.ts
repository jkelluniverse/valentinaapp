import { practiceSettingValue } from "@/lib/practice-settings";

// C40 §1.6 — PER-PRACTICE, DEFAULT OFF. Consent precedes capability: a
// practice that has never touched this runs byte-identical booking logic to
// before C40. Absent row = off. Valentina turns it on.
export const BOOKING_REQUIRES_APPROVAL_KEY = "bookingRequiresApproval";
export async function bookingRequiresApproval(): Promise<boolean> {
  return (await practiceSettingValue(BOOKING_REQUIRES_APPROVAL_KEY)) === "on";
}
