// C15.4 — duty of care. A deterministic, instant crisis screen on CLIENT
// messages: no network round-trip, so a client in distress is met with
// resources immediately (never left waiting on an async reply). Intentionally
// high-recall — a false positive just offers support that's easy to dismiss.
// This is a safety net, not a diagnosis; content is never logged.

const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(ing)?\s+(myself|me)\b/i,
  /\b(i\s+)?want\s+to\s+die\b/i,
  /\bi\s+don'?t\s+want\s+to\s+(live|be here|be alive)\b/i,
  /\b(end|ending)\s+(it\s+all|my\s+life)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[-\s]?harm(ing)?\b/i,
  /\bhurt(ing)?\s+myself\b/i,
  /\bcut(ting)?\s+myself\b/i,
  /\bno\s+reason\s+to\s+(live|go on)\b/i,
  /\bbetter\s+off\s+(dead|without me)\b/i,
  /\boverdos(e|ing)\b/i,
  /\bcan'?t\s+(go on|do this anymore|take it anymore)\b/i,
  /\bnothing\s+to\s+live\s+for\b/i,
];

export function isCrisisSignal(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some((re) => re.test(t));
}

// Warm, immediate resources shown to the client on a crisis signal. US-centric
// defaults; keep general so they travel. (Config-worthy later.)
export const CRISIS_RESOURCES = [
  { label: "Call or text 988", detail: "the Suicide & Crisis Lifeline (US), 24/7" },
  { label: "Text HOME to 741741", detail: "the Crisis Text Line" },
  { label: "Call 911 or go to the nearest ER", detail: "if you are in immediate danger" },
];

export const CRISIS_MESSAGE =
  "It sounds like you may be carrying something really heavy right now, and I don't want you to wait on a reply for this. You deserve support that can be there immediately — please reach out to one of these now. Valentina has also been let know.";
