// C23-ENGAGE §2 — the sequences as DATA, not code paths. Adding a step is a
// line in an array; adding a sequence is an object. Nothing in this file
// touches the database, sends anything, or knows what a template looks like —
// that keeps eligibility and scheduling unit-testable on their own (Verify
// items 2 and 3) and keeps the engine a loop over data.

export type EngageStep = {
  /** Stable ledger key. NEVER renamed: it is half of the unique constraint, so
   *  a rename would re-send a step to everyone who already had it. */
  key: string;
  /** Days after the sequence's anchor moment. */
  offsetDays: number;
  /** Key into messages/{locale}/engage.json → engage.templates.<key>. */
  templateKey: string;
};

/** Which moment the offsets count from. `captured` = the row's own createdAt
 *  (when they handed over their name); `converted` = when they became a
 *  practice, falling back to createdAt if that timestamp is missing. */
export type EngageAnchor = "captured" | "converted";

/** The only prospect facts a predicate is allowed to see. Deliberately narrow:
 *  an audience must not be able to depend on a name, an email, or a note. */
export type EngageAudience = {
  status: string;
  source: string | null;
};

export type EngageSequence = {
  key: string;
  /** Per-sequence gate (§4 "sequence gated off"). Code-level and deliberate:
   *  turning one sequence off is a decision, not a setting to fiddle with. */
  enabled: boolean;
  anchor: EngageAnchor;
  audience: (p: EngageAudience) => boolean;
  steps: EngageStep[];
};

/** The event sources this program's follow-up belongs to. `event-` is the
 *  prefix C23-CAPTURE's printed QR stamps (`event-sept23`). */
export const EVENT_SOURCE_PREFIX = "event-";

export const SEQUENCES: readonly EngageSequence[] = [
  {
    // Three steps is a DECISION (§2): enough to be useful, few enough to
    // respect a professional's inbox. A fourth is not a config change away.
    key: "event-lead",
    enabled: true,
    anchor: "captured",
    audience: (p) => p.status === "LEAD" && (p.source ?? "").startsWith(EVENT_SOURCE_PREFIX),
    steps: [
      { key: "thanks", offsetDays: 0, templateKey: "eventLeadThanks" },
      { key: "what-it-does", offsetDays: 3, templateKey: "eventLeadWhatItDoes" },
      { key: "last-note", offsetDays: 10, templateKey: "eventLeadLastNote" },
    ],
  },
  {
    key: "founding-welcome",
    enabled: true,
    anchor: "converted",
    audience: (p) => p.status === "SIGNED_UP",
    steps: [
      { key: "welcome", offsetDays: 0, templateKey: "foundingWelcome" },
      { key: "check-in", offsetDays: 7, templateKey: "foundingCheckIn" },
    ],
  },
];

export function sequenceByKey(key: string): EngageSequence | undefined {
  return SEQUENCES.find((s) => s.key === key);
}

/**
 * Which sequences a prospect belongs to RIGHT NOW.
 *
 * This is evaluated at tick time against current status, which is what makes
 * §2's mid-sequence transition work without any transition machinery: the
 * moment a LEAD becomes SIGNED_UP they stop matching `event-lead` (so no
 * "still thinking it over?" ever follows a signup) and start matching
 * `founding-welcome`. Nothing has to remember to stop them.
 */
export function sequencesFor(p: EngageAudience): EngageSequence[] {
  return SEQUENCES.filter((s) => s.audience(p));
}

/** The moment a step is due, from the sequence's anchor. */
export function stepDueAt(anchorAt: Date, step: EngageStep): Date {
  return new Date(anchorAt.getTime() + step.offsetDays * 86_400_000);
}

export function anchorFor(
  sequence: EngageSequence,
  row: { createdAt: Date; convertedAt: Date | null },
): Date {
  return sequence.anchor === "converted" ? (row.convertedAt ?? row.createdAt) : row.createdAt;
}
