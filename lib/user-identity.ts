// GLOBAL BY INTENT — "does this email already have an account, ANYWHERE?"
//
// `User.email` is `@unique` in the schema, across every tenant, because sign-in
// is by email: one address is one login for the whole platform. So "is this
// address taken?" is a question about the WHOLE database and never about the
// caller's practice.
//
// WHY THIS FILE EXISTS. Five call sites asked that question through the
// TENANT-SCOPED client, which silently rewrites `findUnique` into `findFirst`
// with a tenant filter. Each therefore answered "free" for an address already
// taken in another practice — and the write that followed then hit the database's
// unique constraint and failed with a generic error instead of "that address is
// already in use". Not a data-integrity breach; the constraint always held. A
// wrong answer and a confusing failure, and in the invite path a stranded invite.
//
// The class is "global by intent, scoped by accident" (rulings 136/156). It was
// found by a category correction rather than by looking for it, and the first
// survey of it missed two of the five — which is why the answer now lives in ONE
// named function that a gate can count, instead of five inline queries that have
// to be spotted by eye.
//
// It returns a BOOLEAN on purpose. Every caller only ever asked "taken?", and
// returning the row would invite leaking another practice's user across the
// tenant boundary — the exact thing the scoped client exists to prevent.
import { rawPrisma } from "@/lib/prisma-internal";

export async function emailInUse(email: string): Promise<boolean> {
  const addr = email.trim().toLowerCase();
  if (!addr) return false;
  return (await rawPrisma.user.findUnique({ where: { email: addr }, select: { id: true } })) !== null;
}
