import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/calendar-links";

// One quiet row of calendar doors: Google (URL), Apple (the .ics — opens
// straight into the iPhone calendar), Outlook (URL). Server component; the
// caller supplies the authorized .ics href and any translated labels.
export function AddToCalendar({
  event,
  icsHref,
  label = "Add to calendar:",
  className = "",
}: {
  event: CalendarEvent;
  icsHref: string;
  label?: string;
  className?: string;
}) {
  const link =
    "font-medium text-wine underline-offset-4 hover:underline";
  return (
    <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}>
      <span className="text-slate">{label}</span>
      <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={link}>
        Google
      </a>
      <a href={icsHref} className={link}>
        Apple
      </a>
      <a href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={link}>
        Outlook
      </a>
    </span>
  );
}
