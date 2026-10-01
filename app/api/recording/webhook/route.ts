import { NextResponse } from "next/server";

// C19 REC.2 — the recorder's processed-recording callback (recording_id -> pull -> draft).
//
// DISABLED — RULING 241. This route decided its tenant by the request Host:
// lib/recording.ts reads and writes through the SCOPED client, whose tenant is
// x-forwarded-host (lib/prisma.ts:124-125).
// A machine caller's secret proves WHO sent it, never WHOSE tenant it is about
// (ruling 239), and nothing in this payload names a tenant — the body is a recording_id, the pull it
// triggers returns segments/tags/audio and no account, and the provider is ONE
// global POCKET_API_KEY (lib/recording.ts:58-61).
//
// It has carried ZERO traffic in every census this program has run, so a
// per-connection ingress (ruling 196's shape) would be a mechanism with no user
// to prove it against. OFF is a fact; an exemption would be a promise.
//
// What stays: lib/recording.ts is untouched, so re-enabling is a ROUTE change — the
// attribution model is lib/capture.ts after C38-B (ruling 242): resolve the
// tenant from a payload field through the raw client, require it from every
// caller, drop unknowns. This file imports NOTHING that reaches the database,
// and audits/host-tenancy-verify.ts asserts that it cannot (kind m2m-disabled).
//
// TRACKING: C38-DISABLED-INGRESS — re-enable per ruling 196 against a real
// account, with the ruling-242 gate leg: identical payload, other tenant's
// Host, lands where the row says.

export const dynamic = "force-dynamic";

const GONE = {
  error: "disabled",
  tracking: "C38-DISABLED-INGRESS",
  note: "recording ingress is disabled until it carries a tenant (ruling 241)",
};

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}
