import type { PrismaClient } from "@prisma/client";
import { headers } from "next/headers";
import { rawPrisma } from "./prisma-internal";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG, SCOPED_MODEL_SET, scopeFilter } from "./tenancy/scope";
import { stampCreateInput, stampUpdateInput } from "./tenancy/stamp";
import { identitySelect } from "./tenancy/model-identity";
import { ambientTenantId } from "./tenancy/tenant-scope";
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
//     headers() throws → the OPT-IN out-of-request scope is consulted
//     (lib/tenancy/tenant-scope.ts: withTenantScope(tenantId, fn)), and if
//     the caller is not inside one, passthrough, unscoped — exactly as
//     before. Ops tooling states its own intentions; the request path is the
//     security boundary. THE REQUEST'S TENANT ALWAYS WINS: the scope is
//     never consulted when headers() resolved.
//
// Per-method behavior on scoped models:
//   - where-filter reads/writes (findMany, findFirst[OrThrow], count,
//     aggregate, groupBy, updateMany, deleteMany): tenant filter ANDed in.
//   - findUnique[OrThrow]: converted to findFirst[OrThrow] with the filter —
//     a row from another tenant is simply "not found", identical shape.
//   - create/createMany: rows stamped with the request tenant (explicit
//     tenantId wins — the value is never overwritten), INCLUDING nested
//     relation writes at any depth (create / createMany / connectOrCreate /
//     nested upsert / creates inside a nested update) — see lib/tenancy/stamp.ts.
//   - update/delete/upsert (unique where): for NON-default tenants an
//     ownership pre-check runs first (fail-closed); the default tenant
//     passes through — every legacy row is already hers, and her hot paths
//     stay at zero extra queries. The field(s) the pre-check selects come
//     from the Prisma DMMF (lib/tenancy/model-identity.ts), not from an
//     assumption that every model has `id`; a model whose identity cannot be
//     derived makes the write THROW, never skip the check (C25 §1).
//   - $transaction(fn): the callback's tx client is wrapped the same way.
//   - $transaction([...]): wrapped calls carry their op description; the
//     array form rebuilds real Prisma promises with the filter injected.
//
// Known honest limits (documented, revisit when a non-default tenant gets
// real feature traffic): $queryRaw/$executeRaw bypass scoping (build-guarded
// to the allowlist), and OUTSIDE a request AND OUTSIDE withTenantScope this
// client is still a passthrough by design — so a CLI script that neither
// states a tenantId nor wraps itself in a scope writes a NULL row. That
// remains deliberate and, crucially, LOUD: the null-tenant audit sees it.
// Implicitly stamping such writes with the default tenant was considered and
// REJECTED (ruling 24) — it would hide a second practice's forgotten rows
// inside Valentina's. Ops tooling states its own tenant, now with one line
// instead of one per call site (C24.1-TENANT-SCOPE §1).

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
    // Outside a request. The request path NEVER reaches here, so nothing a
    // caller does can override a request's tenant (C24.1 §1 precedence 2/3).
    // Inside withTenantScope(T, …): T. Otherwise null — passthrough,
    // unstamped, visible to the null-tenant audit, exactly as before.
    return ambientTenantId();
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

// create / createMany / createManyAndReturn — the row AND every nested create
// beneath it inherit the request's tenant. Explicit values are preserved.
function stampCreate(model: string, args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return { ...args, data: stampCreateInput(model, args.data ?? {}, tenantId) };
}

// update / updateMany — the target row's tenantId is never rewritten, but a
// nested create inside the update payload is stamped.
function stampUpdate(model: string, args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  if (!("data" in args)) return args;
  const data = stampUpdateInput(model, args.data, tenantId);
  return data === args.data ? args : { ...args, data };
}

// upsert — `create` behaves like a create (stamped, nested included);
// `update` behaves like an update (row untouched, nested creates stamped).
function stampUpsert(model: string, args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args, create: stampCreateInput(model, args.create ?? {}, tenantId) };
  if ("update" in args) out.update = stampUpdateInput(model, args.update, tenantId);
  return out;
}

// ---------------------------------------------------------------------------
// THE FAIL-CLOSED OWNERSHIP PRE-CHECK (C25-PRACTICE-SETTING-TENANCY §1)
//
// Before a NON-default tenant touches a row by unique key, prove the row is
// not somebody else's. Two things changed here in C25, both of them because
// the old shape refused writes it should have allowed while proving less than
// it appeared to:
//
//   1. The select comes from the DMMF, per model, instead of being hardcoded
//      to `{ id: true }`. `PracticeSetting` had no `id` column, so the old
//      pre-check threw a Prisma VALIDATION error before it could check
//      anything — a functional wall for every non-default tenant across ~10
//      product paths (ruling 32). If the identity cannot be derived,
//      `identitySelect` THROWS: the check is never skipped for any model.
//
//   2. `upsert` is checked for the right thing. An upsert means "update it if
//      it exists, otherwise create it". What must be refused is TOUCHING
//      SOMEONE ELSE'S ROW — not the row's absence, which is simply the create
//      branch, and the create branch is tenant-stamped (lib/tenancy/stamp.ts)
//      so it cannot land in another tenant. The old check conflated the two
//      and therefore refused every first-ever upsert by any non-default
//      tenant — on `PracticeSetting` and on 40+ other product call sites.
//      The refusal that mattered is kept and is now explicit: the target is
//      looked up WITHOUT the tenant filter, and a row owned by another tenant
//      is refused. Nothing that was refused for safety is now allowed.
// ---------------------------------------------------------------------------
type Delegate = Record<string, (a?: unknown) => Promise<unknown>>;

async function assertUniqueWriteAllowed(
  d: Delegate,
  model: string,
  method: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  // Throws for a model whose identifying field(s) cannot be derived. That is
  // the fail-closed outcome and must never be turned into a skip.
  const select = identitySelect(model);
  const target = expandUniqueWhere(args.where as Record<string, unknown>);

  if (method === "upsert") {
    const existing = (await d.findFirst({
      where: target,
      select: { ...select, tenantId: true },
    })) as { tenantId?: string | null } | null;
    if (existing && existing.tenantId !== tenantId) {
      throw new Error(`tenant-scope: ${model}.upsert target belongs to another tenant`);
    }
    return;
  }

  const owned = await d.findFirst({ where: { AND: [scopeFilter(tenantId), target] }, select });
  if (!owned) throw new Error(`tenant-scope: ${model}.${method} target not found in tenant scope`);
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
  if (CREATE.has(method)) return d[method](stampCreate(op.model, args, tenantId));
  if (WRITE_WHERE.has(method)) return d[method](withScope(stampUpdate(op.model, args, tenantId), tenantId));
  if (UNIQUE_WRITE.has(method)) {
    if (tenantId !== DEFAULT_TENANT_ID) {
      await assertUniqueWriteAllowed(d, op.model, method, args, tenantId);
    }
    if (method === "upsert") return d.upsert(stampUpsert(op.model, args, tenantId));
    if (method === "update") return d.update(stampUpdate(op.model, args, tenantId));
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
          // Array form. Two passes, and they must stay separate: the
          // ownership pre-checks are async, but the transaction items must be
          // UNRESOLVED PrismaPromises — awaiting a built op would execute it
          // outside the transaction (and fail $transaction's "must be Prisma
          // Client promises" check). So: await the pre-checks first, then
          // build the promise array synchronously.
          const items = arg as { __veritasOp?: Op }[];
          if (tid !== null && tid !== DEFAULT_TENANT_ID) {
            for (const item of items) {
              const op = item?.__veritasOp;
              if (op && UNIQUE_WRITE.has(op.method)) {
                const d = (target as Record<string, Delegate>)[op.model];
                await assertUniqueWriteAllowed(d, op.model, op.method, op.args ?? {}, tid);
              }
            }
          }
          const real = items.map((item) =>
            item?.__veritasOp ? buildTxCall(target, item.__veritasOp, tid) : item,
          );
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

// Array-form helper — SYNCHRONOUS by design: it must return an UNRESOLVED
// PrismaPromise for $transaction to batch atomically. Any ownership
// pre-check runs in the caller BEFORE this is called (awaiting here would
// execute the op outside the transaction). Injects the tenant filter/stamp.
function buildTxCall(client: object, op: Op, tenantId: string | null): unknown {
  const d = (client as Record<string, Record<string, (a?: unknown) => unknown>>)[op.model];
  const { method } = op;
  const args = op.args ?? {};
  if (tenantId === null) return d[method](Object.keys(args).length ? args : undefined);
  if (READ_WHERE.has(method)) return d[method](withScope(args, tenantId));
  if (method in UNIQUE_READ) return d[UNIQUE_READ[method]](withScopeUnique(args, tenantId));
  if (CREATE.has(method)) return d[method](stampCreate(op.model, args, tenantId));
  if (WRITE_WHERE.has(method)) return d[method](withScope(stampUpdate(op.model, args, tenantId), tenantId));
  if (UNIQUE_WRITE.has(method)) {
    if (method === "upsert") return d.upsert(stampUpsert(op.model, args, tenantId));
    if (method === "update") return d.update(stampUpdate(op.model, args, tenantId));
    return d[method](args);
  }
  throw new Error(`tenant-scope: unclassified prisma method "${op.model}.${method}"`);
}

export const prisma = wrapClient(rawPrisma);

/**
 * The tenant this call would be scoped to, by the SAME precedence the client
 * itself uses (request headers → withTenantScope → null). Exported for the
 * one case a caller genuinely cannot avoid knowing its own tenant: addressing
 * a row whose unique key INCLUDES tenantId, which TypeScript will not let a
 * call site express otherwise (lib/practice-settings.ts).
 *
 * `null` means "no request and no scope". Callers must FAIL, not fall back to
 * the default tenant — ruling 24 rejected implicit default-tenant stamping,
 * and this resolver is not a back door to it.
 */
export function scopeTenantId(): Promise<string | null> {
  return requestTenantId();
}
