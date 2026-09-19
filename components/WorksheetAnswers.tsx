import type { WorksheetField, WorksheetAnswers } from "@/lib/worksheet-meta";

// Read-only rendering of a completed worksheet (client revisit + practitioner read).
export function WorksheetAnswersView({
  fields,
  answers,
}: {
  fields: WorksheetField[];
  answers: WorksheetAnswers;
}) {
  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        if (field.type === "SECTION") {
          return (
            <div key={field.id} className="mt-1 flex flex-col gap-1">
              <h2 className="font-headline text-xl font-semibold text-wine">{field.label}</h2>
              <div className="h-px w-12 bg-mocha" />
            </div>
          );
        }
        const value = answers[field.id];
        const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <p className="text-sm font-medium text-mocha">{field.label}</p>
            {empty ? (
              <p className="text-sm italic text-slate">— left blank —</p>
            ) : field.type === "SCALE" ? (
              <div className="flex items-center gap-1" title={`${value} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-2.5 w-2.5 rounded-full ${
                      typeof value === "number" && n <= value ? "bg-mocha" : "bg-line"
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm text-ink">{String(value)} / 5</span>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-ink">
                {Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? "Yes" : String(value)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
