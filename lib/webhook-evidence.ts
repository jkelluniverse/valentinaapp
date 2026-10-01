// RULING 247 — THE AUDIT LINE CARRIES THE VERDICT; THE RESPONSE DOES NOT.
//
// Stripe and Square receive { ok: true } for a handled DROP (unmatched
// customer, unmatched merchant) exactly as for a success, because anything
// that looks like failure invites a retry storm against a message we have
// already correctly refused. So the response body cannot distinguish the two,
// and a gate asserting on it cannot either (ruling 243).
//
// The evidence lives here instead: one structured line per outcome, naming
// the route, the reason and the UNMATCHED IDENTIFIER — never the payload. A
// gate reads the server's log for it, with the positive control that a
// matched event writes a DIFFERENT line (ruling 110: the absence of a drop
// line means nothing until a drop has been shown to produce one).
export function logWebhookDrop(route: string, reason: string, identifier: string | null): void {
  console.warn(`[webhook-drop] ${JSON.stringify({ route, reason, id: identifier ?? "(none)" })}`);
}
export function logWebhookApplied(route: string, eventId: string, tenantId: string): void {
  console.log(`[webhook-applied] ${JSON.stringify({ route, eventId, tenantId })}`);
}
