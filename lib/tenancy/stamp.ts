// PLATFORM — tenant stamping for write payloads, including NESTED relation
// writes (C24-NESTED-STAMP §2).
//
// The scoped client (lib/prisma.ts) used to stamp only the TOP-LEVEL row of a
// create: `{ tenantId, ...data }`. A nested relation write — `parent.create({
// data: { child: { create: {...} } } })` — wrote the child with a null
// tenantId, because nothing walked into the payload. This module closes that,
// at any depth, for every nested write operator Prisma offers.
//
// Two rules that are load-bearing, not stylistic:
//
//   1. An explicitly-provided `tenantId` is NEVER overwritten — not even a
//      DIFFERENT tenant's id. Silently normalising a cross-tenant write would
//      convert a visible integrity defect into an invisible one, and the
//      null-tenant audit is the thing that has to be able to see it.
//      "Explicit" means the key is present with a value other than
//      `undefined`; `undefined` is Prisma's own "not provided", and an
//      explicit `null` is preserved (it is a deliberate statement, and it
//      stays audit-visible).
//   2. Only models in SCOPED_MODEL_SET are stamped. Platform-level models
//      (Tenant, TenantModule, PractitionerProspect, ProspectMessage,
//      WebhookEvent) and IntakeAnswer (no tenantId column at all) are walked
//      THROUGH but never stamped — stamping them would be a new bug wearing
//      this fix's clothes.
//
// PERFORMANCE. This runs on every write in the application, so the walk is
// driven by the schema, not by the payload: at each node only the keys that
// the DMMF says are relation fields of that model are visited. A `data`
// object with ten scalars and one JSON blob costs ten `Map.get` misses and
// nothing else — JSON columns, Buffers and Dates are never descended into,
// because they are not relation fields. Objects are copied shallowly only
// along paths that actually changed (copy-on-write); an unchanged payload is
// returned by identity, so the common case (no nested writes anywhere in the
// codebase today) allocates one object for the top-level stamp and no more.
// The relation map is built once, lazily, from Prisma.dmmf.

import { Prisma } from "@prisma/client";
import { SCOPED_MODEL_SET } from "./scope";

// delegate key (camelCase, what lib/prisma.ts sees) → relation field → target delegate key
type RelationMap = ReadonlyMap<string, ReadonlyMap<string, string>>;

let RELATIONS: RelationMap | null = null;

const delegateKey = (modelName: string) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

function relations(): RelationMap {
  if (RELATIONS) return RELATIONS;
  const map = new Map<string, Map<string, string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Map<string, string>();
    for (const f of model.fields) {
      if (f.kind === "object") fields.set(f.name, delegateKey(f.type));
    }
    if (fields.size) map.set(delegateKey(model.name), fields);
  }
  RELATIONS = map;
  return map;
}

function isPayloadObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof Uint8Array) // Buffer (HandwrittenNote.pdf, AgreementFile bytes)
  );
}

function hasExplicitTenant(row: Record<string, unknown>): boolean {
  return "tenantId" in row && row.tenantId !== undefined;
}

// ---- create inputs: stamp this row, then recurse ----

/**
 * Stamp a create input (object or array of objects) for `model` and every
 * nested create beneath it. Returns the input by identity when nothing
 * changed.
 */
export function stampCreateInput(model: string, input: unknown, tenantId: string): unknown {
  if (Array.isArray(input)) return mapArray(input, (item) => stampCreateInput(model, item, tenantId));
  if (!isPayloadObject(input)) return input;

  const walked = walkRelationFields(model, input, tenantId);
  const needsStamp = SCOPED_MODEL_SET.has(model) && !hasExplicitTenant(input);
  if (!needsStamp) return walked;
  const out: Record<string, unknown> = { ...(walked as Record<string, unknown>) };
  out.tenantId = tenantId;
  return out;
}

/**
 * Walk an update input for `model`: the row itself is NEVER stamped (an
 * update must not rewrite tenantId), but nested creates inside it are.
 */
export function stampUpdateInput(model: string, input: unknown, tenantId: string): unknown {
  if (Array.isArray(input)) return mapArray(input, (item) => stampUpdateInput(model, item, tenantId));
  if (!isPayloadObject(input)) return input;

  // To-many nested updates use `{ where, data }`; to-one uses the data
  // directly. Handle both — `where`/`data` are not relation field names on
  // any model, so treating the wrapper as an update input is a no-op.
  let base: Record<string, unknown> = input;
  if (isPayloadObject(input.data)) {
    const nested = stampUpdateInput(model, input.data, tenantId);
    if (nested !== input.data) base = { ...input, data: nested };
  }
  return walkRelationFields(model, base, tenantId);
}

// Visit only the keys the schema says are relation fields of `model`.
function walkRelationFields(
  model: string,
  obj: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  const fields = relations().get(model);
  if (!fields) return obj;
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(obj)) {
    const target = fields.get(key);
    if (!target) continue;
    const value = obj[key];
    if (!isPayloadObject(value)) continue; // connect-by-id shorthand, null, etc.
    const next = walkNestedWrite(target, value, tenantId);
    if (next !== value) {
      out ??= { ...obj };
      out[key] = next;
    }
  }
  return out ?? obj;
}

// One relation-write object: { create }, { createMany }, { connectOrCreate },
// { upsert }, { update }, { updateMany }, { connect }, { set }, { delete }, …
// Only the operators that can CREATE a row, or can CONTAIN one, are touched.
function walkNestedWrite(
  target: string,
  value: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  const replace = (key: string, next: unknown) => {
    if (next !== value[key]) {
      out ??= { ...value };
      out[key] = next;
    }
  };

  if ("create" in value) replace("create", stampCreateInput(target, value.create, tenantId));

  // createMany: { data: [...], skipDuplicates? } — scalars only, no deeper nesting.
  if (isPayloadObject(value.createMany)) {
    const cm = value.createMany;
    const nextData = stampCreateInput(target, cm.data, tenantId);
    if (nextData !== cm.data) {
      out ??= { ...value };
      out.createMany = { ...cm, data: nextData };
    }
  }

  if ("connectOrCreate" in value) {
    replace(
      "connectOrCreate",
      mapEach(value.connectOrCreate, (item) => replaceKey(item, "create", (c) => stampCreateInput(target, c, tenantId))),
    );
  }

  if ("upsert" in value) {
    replace(
      "upsert",
      mapEach(value.upsert, (item) => {
        const withCreate = replaceKey(item, "create", (c) => stampCreateInput(target, c, tenantId));
        return replaceKey(withCreate, "update", (u) => stampUpdateInput(target, u, tenantId));
      }),
    );
  }

  // A nested update can itself carry nested creates (grandchildren).
  if ("update" in value) replace("update", stampUpdateInput(target, value.update, tenantId));
  if ("updateMany" in value) replace("updateMany", stampUpdateInput(target, value.updateMany, tenantId));

  return out ?? value;
}

// ---- small copy-on-write helpers ----

function mapArray(arr: unknown[], f: (item: unknown) => unknown): unknown[] {
  let changed = false;
  const out = arr.map((item) => {
    const next = f(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : arr;
}

function mapEach(value: unknown, f: (item: Record<string, unknown>) => unknown): unknown {
  if (Array.isArray(value)) return mapArray(value, (item) => (isPayloadObject(item) ? f(item) : item));
  return isPayloadObject(value) ? f(value) : value;
}

function replaceKey(
  obj: Record<string, unknown>,
  key: string,
  f: (v: unknown) => unknown,
): Record<string, unknown> {
  if (!(key in obj)) return obj;
  const next = f(obj[key]);
  return next === obj[key] ? obj : { ...obj, [key]: next };
}
