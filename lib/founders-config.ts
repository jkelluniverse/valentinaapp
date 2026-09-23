// C35-FOUNDERS-EVENT — the founding page's PURE configuration.
//
// Same discipline as lib/capture-config.ts and lib/signup-config.ts: NO database
// import anywhere in this module's graph, so /founders can import it without
// dragging the data layer behind it.
//
// EVERY COMMERCIAL FIGURE HERE IS RULING 175's, AND ONLY RULING 175's.
// Constitution law 2 prohibits prices on screens; ruling 175 lifts that for
// THESE NUMBERS ONLY. A figure that is not in this file must not reach a page,
// and a figure in this file must match the ruling exactly.

/** The value printed on the PSYCH-K® FTL 2026 cards. */
export const CARD_SOURCE = "psychk-health-wellbeing-ftl-2026";
/** Ruling 181 — what a card-scanned lead is STORED as. */
export const CARD_TAG = "event-psychk-ftl-2026";

/**
 * Ruling 181's mapping, in ONE place so the page and the apply route cannot
 * drift apart — which is exactly how Stage 1's `?source=` was preserved and
 * then ignored (ruling 179).
 *
 * Returns the tag to store, or null to leave the default alone. THIS FUNCTION
 * INVENTS NO TAGS: an unknown source yields null, because a made-up tag is
 * worse than "web" — "web" is honestly unknown, an invented one looks deliberate.
 */
export function sourceTagFor(rawSource: string | null | undefined): string | null {
  const s = (rawSource ?? "").trim().toLowerCase();
  return s === CARD_SOURCE ? CARD_TAG : null;
}

// ---------------------------------------------------------------------------
// RULING 175's FIGURES. Nothing else.
// ---------------------------------------------------------------------------
export const PRICING = {
  /** Struck through and LABELLED "standard Practice price" — never a false
   *  temporary retail price (brief §9). */
  standardPractice: "$199",
  foundingFirstYear: "$99",
  foundingAfter: "$149",
  onboardingIncluded: "$500",
  guaranteeDays: 60,
  seats: 20,
  /** Static text. Ruling 176 cuts the counter; the DATE is not a countdown. */
  closesText: "October 7, 2026 at 11:59 PM ET",
} as const;

/** Ruling 176 — there is NO counter. This constant exists so the phrase stays
 *  a FIXED STATEMENT of the offer's terms and can never become a count. */
export const SEATS_STATEMENT = `Limited to ${PRICING.seats} founding practices`;

/**
 * RULING 188 — the three absent claims are CUT, not softened.
 * Removed entirely from customer-facing copy: the Practice Manager agent, the
 * morning brief, and the admin/VA seat. No "coming soon", no roadmap teaser,
 * no asterisk. A paid page states what exists today.
 *
 * The two PARTIAL claims stay with corrected wording:
 *   - recorded hours: kept as a stated plan limit. NOTHING METERS IT — tracked
 *     as an operational risk, not a copy problem.
 *   - custom domain: kept. It works, but has no practitioner-facing flow, so it
 *     depends on guided onboarding doing it for them.
 */
export const INCLUDED = [
  {
    label: "Run the practice",
    items: [
      "Unlimited clients",
      "Scheduling and packages",
      "Square payments",
      "Agreements and electronic signatures",
      "Dispute documentation packet",
      "One practitioner seat",
    ],
  },
  {
    label: "Hold the context",
    items: [
      "Session notes and client journaling",
      "Consent-based session recording",
      "60 recorded hours included each month",
      "Full Client Intelligence layer",
      "Cross-record patterns with source-backed context",
    ],
  },
  {
    label: "Extend the work",
    items: [
      "Programs and courses",
      "Enriched readings and Integration Guide",
      "Session preparation",
      "English and Spanish experiences",
    ],
  },
  {
    label: "Make it yours",
    items: [
      "Custom domain and full practice branding",
      "Priority support",
      "One guided onboarding call",
    ],
  },
] as const;

export const TERMS_BULLETS = [
  `Founding enrollment ends ${PRICING.closesText} or when ${PRICING.seats} paid seats are claimed, whichever occurs first.`,
  `The founding price is ${PRICING.foundingFirstYear}/month for 12 months, then ${PRICING.foundingAfter}/month while continuously active.`,
  "A lapse, cancellation, or downgrade to Solo ends the founding rate.",
  "Studio upgrades use Studio pricing.",
  `Founding subscriptions include a ${PRICING.guaranteeDays}-day money-back guarantee.`,
  "The founding rate cannot be combined with annual or referral discounts.",
  "Build work, data migration, and custom modality development are separately scoped.",
] as const;

/**
 * The Founding Practice Addendum does not exist yet. The brief requires the
 * link "Read the complete Founding Practice terms" before enrollment — and the
 * dispatch is explicit: do NOT link a placeholder, a draft, or a 404. The
 * summary above ships; the LINK renders only when this is a real URL.
 * When Jacob supplies the document it is verbatim legal text (law 4):
 * engineering never edits it.
 */
export const ADDENDUM_URL: string | null = null;
