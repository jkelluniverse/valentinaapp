import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";

// Staging-only: (re)seed the fixture roster in place — the same deterministic
// seed the CLI runs, callable where the staging DATABASE_URL actually lives.
//   curl -X POST "https://<staging-host>/api/jobs/seed-fixtures?secret=$JOBS_SECRET"
// Refuses outright on production (env name AND the seed's own host guard).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!envName || envName === "production") {
    return NextResponse.json(
      { ok: false, error: "fixtures are staging-only (RAILWAY_ENVIRONMENT_NAME guard)" },
      { status: 403 },
    );
  }
  try {
    const { seedFixtures } = await import("@/prisma/fixtures/seed-staging");
    const counters = await seedFixtures({ fromRoute: true });
    console.log(`[seed-fixtures] roster reseeded via route env=${envName}`);
    return NextResponse.json({ ok: true, env: envName, ...counters });
  } catch (e) {
    console.error("[seed-fixtures] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "seed failed — see logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
