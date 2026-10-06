// ADDENDUM R (C20 v3.1) — the Data Retention & Deletion Schedule the client
// signs must match what the system does. ONE source of truth for the number,
// env-overridable (RETENTION_YEARS), drafted at 3 years pending counsel's
// confirmation (outstanding item on the install report).
//
// Current enforcement surface: the deletion-request flow and the client-
// facing schedule note read THIS value. Automated purge-at-expiry machinery
// does not exist yet — flagged in the install report; when Addendum R's
// final text lands, purge jobs get built against this same constant.

export function retentionYears(): number {
  const fromEnv = Number(process.env.RETENTION_YEARS);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 3;
}

export function retentionNote(locale: "en" | "es"): string {
  const years = retentionYears();
  return locale === "es"
    ? `Según el Anexo R, los registros se conservan ${years} años tras el fin de la relación (los acuerdos firmados se conservan como registros legales).`
    : `Per Addendum R, records are retained for ${years} years after the relationship ends (signed agreements are kept as legal records).`;
}
