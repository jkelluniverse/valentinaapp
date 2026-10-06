import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

// Per-device push subscription management. The browser hands us its endpoint +
// keys; we file them under the signed-in user. Unsubscribing (or a new owner
// on the same device) replaces the row — an endpoint belongs to whoever is
// signed in on that device.

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  }
  const { endpoint, keys } = body;
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  console.log(`[push] subscribed user=${user.id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: user.id },
  });
  console.log(`[push] unsubscribed user=${user.id}`);
  return NextResponse.json({ ok: true });
}
