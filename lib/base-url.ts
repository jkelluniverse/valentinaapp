import { headers } from "next/headers";

// Build the app's public origin from the incoming request headers, so invite
// links work on any host (localhost, Railway) with no extra env var.
export function getBaseUrl() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// For contexts where request headers may be absent or wrong (cron-triggered
// jobs): prefer an explicit env var, fall back to the request, then to the
// production domain — a payment email must never carry a broken link.
export function getBaseUrlSafe() {
  const fromEnv = process.env.PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    return getBaseUrl();
  } catch {
    return "https://valentinavelez.com";
  }
}
