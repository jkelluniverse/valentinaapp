import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { ensureBookingWorksheet } from "@/lib/booking-form";

// C42 §2.7 — Settings → "Booking questions" opens the worksheet builder on
// the practice's booking form, creating it from the frozen default on the
// FIRST visit here. This is a practitioner's own, authenticated visit — the
// one place the spec allows the booking worksheet to come into being (never a
// public render: a stranger's page view must not write). The editor is reused
// because it exists; a settings page that re-implemented field editing would
// be the fourth question system.
export const dynamic = "force-dynamic";

export default async function BookingQuestionsPage() {
  const me = await requirePractitioner();
  const id = await ensureBookingWorksheet(me.id);
  redirect(`/practitioner/worksheets/${id}`);
}
