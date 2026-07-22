import type { PrismaClient } from "@prisma/client";
import { headers } from "next/headers";
import { rawPrisma } from "./prisma-internal";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG, SCOPED_MODEL_SET, scopeFilter } from "./tenancy/scope";
import { slugFromHost, tenantBySlug } from "./tenancy";

// THE tenant-scoped Prisma client. Same import path, same call surface, same
// types as before — but inside an HTTP request every query on a scoped model
// is filtered to the request's tenant structurally, so an unscoped query
// cannot be written by forgetting something (the unread-badge class of bug).
//
// How the scope is decided, per call:
//   - Inside a request: host → slug → tenantId (default slug short-circuits
//     to the fixed id; other slugs hit the 60s tenant cache). DEFAULT tenant
//     scope = { tenantId | null } (legacy rows are hers); any other tenant is
//     strict { tenantId }.
//   - Outside a request (scripts, seeds, audits, jobs run from the CLI):
//     headers() throws → passthrough, unscoped. Ops tooling states its own
//     intentions; the request path is the security boundary.
//
// Per-method behavior on scoped models:
//   - where-filter reads/writes (findMany, findFirst[OrThrow], count,
//     aggregate, groupBy, updateMany, deleteMany): tenant filter ANDed in.
//   - findUnique[OrThrow]: converted to findFirst[OrThrow] with the filter —
//     a row from another tenant is simply "not found", identical shape.
//   - create/createMany: rows stamped with the request tenant (explicit
//     tenantId wins — the value is never overwritten).
//   - update/delete/upsert (unique where): for NON-default tenants an
//     ownership pre-check runs first (fail-closed); the default tenant
//     passes through — every legacy row is already hers, and her hot paths
//     stay at zero extra queries.
//   - $transaction(fn): the callback's tx client is wrapped the same way.
//   - $transaction([...]): wrapped calls carry their op description; the
//     array form rebuilds real Prisma promises with the filter injected.
//
// Known honest limits (documented, revisit when a non-default tenant gets
// real feature traffic): nested relation writes are not auto-stamped, and
// $queryRaw/$executeRaw bypass scoping (build-guarded to the allowlist).

type Op = { model: string; method: string; args: Record<string, unknown> };

const READ_WHERE = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const UNIQUE_READ: Record<string, string> = { findUnique: "findFirst", findUniqueOrThrow: "findFirstOrThrow" };
const CREATE = new Set(["create", "createMany", "createManyAndReturn"]);
const WRITE_WHERE = new Set(["updateMany", "deleteMany"]);
const UNIQUE_WRITE = new Set(["update", "delete", "upsert"]);

async function requestTenantId(): Promise<string | null> {
  let host: string | null;
  try {
    const h = headers();
    host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  } catch {
    return null; // outside a request — passthrough
  }
  const slug = slugFromHost(host);
  if (slug === DEFAULT_TENANT_SLUG) return DEFAULT_TENANT_ID;
  const t = await tenantBySlug(slug);
  return t?.id ?? DEFAULT_TENANT_ID; // unknown slug behaves like the default host (matches getTenant)
}

function withScope(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return { ...args, where: { AND: [scopeFilter(tenantId), (args.where as object) ?? {}] } };
}

// Unique-input syntax → plain filter syntax. findUnique accepts compound
// aliases ({ userId_version: { userId, version } }) that findFirst rejects —
// flatten them into their component fields. Unique inputs are always scalar
// equality, so a plain-object value can only be a compound alias.
function expandUniqueWhere(where: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where ?? {})) {
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
}

function withScopeUnique(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return { ...args, where: { AND: [scopeFilter(tenantId), expandUniqueWhere(args.where as Record<string, unknown>)] } };
}

function stampCreate(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  const stamp = (row: Record<string, unknown>) => ({ tenantId, ...row });
  const data = args.data;
  return { ...args, data: Array.isArray(data) ? data.map(stamp) : stamp((data as Record<string, unknown>) ?? {}) };
}

// Resolve one op against a client (rawPrisma or a transaction client),
// with the tenant filter applied. tenantId null = passthrough.
async function runOp(client: unknown, op: Op, tenantId: string | null): Promise<unknown> {
  const d = (client as Record<string, Record<string, (a?: unknown) => Promise<unknown>>>)[op.model];
  const { method } = op;
  let args = op.args ?? {};
  if (tenantId === null) return d[method](Object.keys(args).length ? args : undefined);

  if (READ_WHERE.has(method)) return d[method](withScope(args, tenantId));
  if (method in UNIQUE_READ) return d[UNIQUE_READ[method]](withScopeUnique(args, tenantId));
  if (CREATE.has(method)) return d[method](stampCreate(args, tenantId));
  if (WRITE_WHERE.has(method)) return d[method](withScope(args, tenantId));
  if (UNIQUE_WRITE.has(method)) {
    if (tenantId !== DEFAULT_TENANT_ID) {
      // Fail-closed ownership check before touching a row by unique key.
      const owned = await d.findFirst({
        where: { AND: [scopeFilter(tenantId), expandUniqueWhere(args.where as Record<string, unknown>)] },
        select: { id: true },
      });
      if (!owned) {
        throw new Error(`tenant-scope: ${op.model}.${method} target not found in tenant scope`);
      }
    }
    if (method === "upsert") {
      return d.upsert({ ...args, create: { tenantId, ...((args.create as Record<string, unknown>) ?? {}) } });
    }
    return d[method](args);
  }
  throw new Error(
    `tenant-scope: unclassified prisma method "${op.model}.${method}" — extend the scope map in lib/prisma.ts`,
  );
}

// A lazy thenable: executes on first await, and carries its op description so
// $transaction([...]) can rebuild real Prisma promises transactionally.
function makeLazyOp(op: Op) {
  let started: Promise<unknown> | null = null;
  const start = () => (started ??= requestTenantId().then((tid) => runOp(rawPrisma, op, tid)));
  return {
    __veritasOp: op,
    then: (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) => start().then(f, r),
    catch: (r?: (e: unknown) => unknown) => start().catch(r),
    finally: (f?: () => void) => start().finally(f),
  };
}

function wrapDelegate(model: string, real: Record<string, unknown>) {
  return new Proxy(real, {
    get(target, prop: string) {
      const v = target[prop];
      if (typeof v !== "function") return v; // e.g. `.fields`
      return (args?: Record<string, unknown>) => makeLazyOp({ model, method: prop, args: args ?? {} });
    },
  });
}

function wrapClient(base: object): PrismaClient {
  return new Proxy(base, {
    get(target, prop: string) {
      const v = (target as Record<string, unknown>)[prop];
      if (prop === "$transaction") {
        return async (arg: unknown, opts?: unknown) => {
          const tid = await requestTenantId();
          if (typeof arg === "function") {
            return (target as PrismaClient).$transaction(
              (tx) => (arg as (c: unknown) => Promise<unknown>)(wrapTx(tx as object, tid)),
              opts as never,
            );
          }
          // Array form: rebuild each wrapped op as a real PrismaPromise.
          // Ownership pre-checks (non-default tenants) run before the batch.
          const ops = (arg as { __veritasOp?: Op }[]).map((item) => {
            if (!item || !item.__veritasOp) return item; // already a raw PrismaPromise (unscoped model)
            return item.__veritasOp;
          });
          const real: unknown[] = [];
          for (const o of ops) {
            if (o && typeof o === "object" && "model" in (o as object)) {
              real.push(await buildTxOp(target, o as Op, tid));
            } else {
              real.push(o);
            }
          }
          return (target as PrismaClient).$transaction(real as never, opts as never);
        };
      }
      if (SCOPED_MODEL_SET.has(prop)) return wrapDelegate(prop, v as Record<string, unknown>);
      if (typeof v === "function") return (v as (...a: unknown[]) => unknown).bind(target);
      return v;
    },
  }) as PrismaClient;
}

// Inside $transaction(fn) the tenant is already resolved — wrap the tx client
// with eager (non-lazy) scoped calls.
function wrapTx(tx: object, tenantId: string | null) {
  return new Proxy(tx, {
    get(target, prop: string) {
      const v = (target as Record<string, unknown>)[prop];
      if (SCOPED_MODEL_SET.has(prop)) {
        return new Proxy(v as Record<string, unknown>, {
          get(dTarget, method: string) {
            const fn = dTarget[method];
            if (typeof fn !== "function") return fn;
            return (args?: Record<string, unknown>) =>
              runOp(target, { model: prop, method, args: args ?? {} }, tenantId);
          },
        });
      }
      if (typeof v === "function") return (v as (...a: unknown[]) => unknown).bind(target);
      return v;
    },
  });
}

// Array-form helper: perform the pre-check (if any), then produce the REAL
// delegate call (a genuine PrismaPromise) with the filter injected.
async function buildTxOp(client: object, op: Op, tenantId: string | null): Promise<unknown> {
  const d = (client as Record<string, Record<string, (a?: unknown) => unknown>>)[op.model];
  const { method } = op;
  const args = op.args ?? {};
  if (tenantId === null) return d[method](Object.keys(args).length ? args : undefined);
  if (READ_WHERE.has(method)) return d[method](withScope(args, tenantId));
  if (method in UNIQUE_READ) return d[UNIQUE_READ[method]](withScopeUnique(args, tenantId));
  if (CREATE.has(method)) return d[method](stampCreate(args, tenantId));
  if (WRITE_WHERE.has(method)) return d[method](withScope(args, tenantId));
  if (UNIQUE_WRITE.has(method)) {
    if (tenantId !== DEFAULT_TENANT_ID) {
      const owned = await (d.findFirst as (a: unknown) => Promise<unknown>)({
        where: { AND: [scopeFilter(tenantId), expandUniqueWhere(args.where as Record<string, unknown>)] },
        select: { id: true },
      });
      if (!owned) throw new Error(`tenant-scope: ${op.model}.${method} target not found in tenant scope`);
    }
    if (method === "upsert") {
      return d[method]({ ...args, create: { tenantId, ...((args.create as Record<string, unknown>) ?? {}) } });
    }
    return d[method](args);
  }
  throw new Error(`tenant-scope: unclassified prisma method "${op.model}.${method}"`);
}

export const prisma = wrapClient(rawPrisma);
