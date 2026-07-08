import { headers } from "next/headers";

// Build the app's public origin from the incoming request headers, so invite
// links work on any host (localhost, Railway) with no extra env var.
export function getBaseUrl() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
