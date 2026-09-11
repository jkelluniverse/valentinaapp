// CLIENT-ONBOARDING §4.7 — the platform-level intake/discovery string table.
// Platform copy stays neutral and lives HERE, not inline in components, so
// multi-language later is a translation task, not a refactor (Rule 0.5).
// Tenant-entered copy (welcome text, module labels, custom questions) is
// data and never appears in this file.

export const COPY = {
  intake: {
    welcomeTitle: "Welcome",
    welcomeLede: "A few minutes to set things up. Your progress saves automatically — leave and come back anytime.",
    welcomeMinutes: (n: number) => `About ${n} minute${n === 1 ? "" : "s"}.`,
    begin: "Let's begin",
    resumeTitle: "Welcome back",
    resumeLede: "Picking up right where you left off.",
    saved: "Saved",
    back: "Back",
    next: "Continue",
    finish: "Complete my setup",
    doneTitle: "You're all set",
    doneLede: "Thank you — everything's saved.",
    donePreparing: "Your charts are being prepared — they'll appear on your map shortly.",
    goHome: "Go to your space",
    stepAboutYou: "About you",
    stepBirth: "Your birth details",
    stepReview: "Review",
    reviewLede: "A quick look at what you entered. Edit anything before you finish.",
    edit: "Edit",
    // Birth-data helpers (§3B)
    birthTimeUnknown: "I don't know my birth time",
    birthTimeUnknownReassure:
      "That's okay. Some chart details (like houses) need an exact time; the rest works without it.",
    birthTimeHelp: "Birth certificates often list it.",
    birthPlaceHelp: "Used to calculate your charts. You can see everything we store in Review.",
    // Consent (§3D) — the data acknowledgment is always shown, plain English.
    dataAckTitle: "Your information",
    dataAck:
      "The details above are kept privately as part of your record with your practitioner, used to prepare your maps and support your work together, and never shared or sold. You can ask to see or remove your data anytime.",
    recordingConsentTitle: "Session recordings",
    // The recording consent BODY is tenant/version data (RECORDING_CONSENT_TEXT);
    // this is only the surrounding platform frame.
    recordingConsentAgree: "I agree to the recording terms above",
  },
  discovery: {
    // §6.1 teaching empty states — {…} placeholders filled by the surface.
    mapPending: (valuesLabel: string) =>
      `Your map is being prepared — your charts and ${valuesLabel} will appear here shortly.`,
    sessionsEmpty: (practitioner: string) =>
      `After your sessions with ${practitioner}, summaries you've both reviewed will live here.`,
    // §6.3 getting-started card
    finishSetup: (n: number) => `Finish your setup — about ${n} minute${n === 1 ? "" : "s"} left.`,
    dismiss: "Dismiss",
  },
} as const;
