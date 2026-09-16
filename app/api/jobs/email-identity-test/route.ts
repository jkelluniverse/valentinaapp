import { createHash, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { platformIdentity, sendEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

// PLATFORM-SPLIT A4 (Architect-authorized, 2026-09-16) — a ONE-SHOT probe that
// proves the platform identity WORKS, not merely that it is configured: one
// real send through PLATFORM_RESEND_API_KEY, read back from the recipient's
// inbox. This route is TEMPORARY and is reverted once A4 is reported.
//
// Containment, by construction:
//   · the recipient is HARDCODED to the Architect-named +tag address — the
//     route cannot be aimed at anyone else, whatever the caller sends;
//   · the content is fixed below — nothing caller-controlled enters the mail;
//   · the guard accepts JOBS_SECRET (the letter of the dispatch) OR
//     EMAIL_IDENTITY_TEST_TOKEN — a single-purpose token minted for this test,
//     because ruling 73's split keeps JOBS_SECRET itself out of the build
//     session (disclosed deviation: the minted token guards one fixed action
//     and dies with the route).
const RECIPIENT = "jkelluniverse+platform@gmail.com";

function matches(given: string, secret: string | undefined): boolean {
  if (!secret) return false;
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

function authorized(req: NextRequest): boolean {
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return matches(given, process.env.JOBS_SECRET) || matches(given, process.env.EMAIL_IDENTITY_TEST_TOKEN);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const identity = platformIdentity();
  if (!identity) {
    // Which variable is missing is exactly what A4 needs to know — but names
    // only, never values.
    const missing = ["PLATFORM_RESEND_API_KEY", "PLATFORM_FROM_EMAIL", "PLATFORM_LEGAL_ENTITY", "PLATFORM_POSTAL_ADDRESS"].filter(
      (k) => !process.env[k],
    );
    return NextResponse.json({ ok: false, reason: "no-platform-identity", missing }, { status: 200 });
  }

  const res = await sendEmail({
    to: RECIPIENT,
    subject: "Psychefolio platform identity test (A4)",
    text: [
      "This is the A4 platform-identity probe: one real send through the platform's own Resend account.",
      "If you are reading this in the inbox, the platform identity works end to end — sender, envelope, and footer are the evidence.",
    ].join("\n\n"),
    identity,
  });

  return NextResponse.json({ ok: res.ok, skipped: res.skipped ?? false, to: RECIPIENT });
}
