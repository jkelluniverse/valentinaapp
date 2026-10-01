// PLATFORM — the identifying field(s) of a model, derived from the Prisma
// DMMF (C25-PRACTICE-SETTING-TENANCY §1).
//
// WHY THIS EXISTS. The scoped client's fail-closed ownership pre-check
// (lib/prisma.ts) has to fetch *something* about the target row to decide
// whether it belongs to the request's tenant. It used to hardcode
// `select: { id: true }`. That is a hidden assumption about the schema, and
// `PracticeSetting` broke it: its primary key was `key` and it had no `id`
// column at all, so the pre-check died on a Prisma VALIDATION error before it
// could check anything — which meant no non-default tenant could write a
// practice setting (Architect ruling 32).
//
// THE PROPERTY THAT MATTERS. This module either returns a select the pre-check
// can use, or it THROWS. It never returns "nothing to select" and it never
// tells the caller to skip the check. A model that silently bypassed the
// ownership pre-check would be a hole in the tenancy wall wearing a fix's
// clothes, so "I cannot identify this model" has to fail the write, loudly,
// rather than wave it through.
//
// The derivation, in order:
//   1. a single-field primary key (`@id`)            → { <that field>: true }
//   2. a compound primary key (`@@id([a, b])`)       → { a: true, b: true }
//   3. a single-field unique (`@unique`)             → { <that field>: true }
//   4. a compound unique (`@@unique([a, b])`)        → { a: true, b: true }
//   5. anything else                                 → THROW (fail closed)
//
// Steps 3–4 exist because a model can legally be keyed by a unique constraint
// rather than a declared primary key; a select built from one still identifies
// at most one row, which is all the pre-check needs. Step 5 is the point of
// the module.

import { Prisma } from "@prisma/client";

/** A Prisma `select` naming exactly the field(s) that identify one row. */
export type IdentitySelect = Readonly<Record<string, true>>;

// The subset of DMMF model metadata this derivation needs. Declared
// structurally so the pure function can be exercised with synthetic shapes
// (a compound-PK model, a model with no key at all) that the live schema does
// not currently contain.
export type ModelMeta = {
  name: string;
  fields: readonly { name: string; kind?: string; isId?: boolean; isUnique?: boolean }[];
  primaryKey?: { fields: readonly string[] } | null;
  uniqueIndexes?: readonly { fields: readonly string[] }[];
};

export class ModelIdentityError extends Error {
  constructor(model: string) {
    super(
      `tenant-scope: cannot derive an identifying field for model "${model}" from the Prisma schema — ` +
        `refusing to skip the fail-closed ownership pre-check. Give the model a primary key or a unique ` +
        `constraint, or remove it from SCOPED_MODELS.`,
    );
    this.name = "ModelIdentityError";
  }
}

const toSelect = (fields: readonly string[]): IdentitySelect =>
  Object.freeze(Object.fromEntries(fields.map((f) => [f, true as const])));

/**
 * PURE. Derive the identity select for one model's metadata, or throw.
 * Exported so the acceptance gate can prove the compound-PK and no-key
 * branches, neither of which exists in this schema today.
 */
export function identitySelectFor(meta: ModelMeta): IdentitySelect {
  const scalars = meta.fields.filter((f) => f.kind !== "object");

  const idField = scalars.find((f) => f.isId);
  if (idField) return toSelect([idField.name]);

  const compound = meta.primaryKey?.fields;
  if (compound && compound.length > 0) return toSelect(compound);

  const uniqueField = scalars.find((f) => f.isUnique);
  if (uniqueField) return toSelect([uniqueField.name]);

  const compoundUnique = meta.uniqueIndexes?.find((u) => u.fields.length > 0);
  if (compoundUnique) return toSelect(compoundUnique.fields);

  throw new ModelIdentityError(meta.name);
}

// delegate key (camelCase — what lib/prisma.ts sees) → identity select.
// Built once, lazily, from Prisma.dmmf, exactly as lib/tenancy/stamp.ts does.
let CACHE: Map<string, IdentitySelect> | null = null;

const delegateKey = (modelName: string) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

function cache(): Map<string, IdentitySelect> {
  if (CACHE) return CACHE;
  const map = new Map<string, IdentitySelect>();
  for (const model of Prisma.dmmf.datamodel.models) {
    let select: IdentitySelect | null = null;
    try {
      select = identitySelectFor(model as unknown as ModelMeta);
    } catch {
      // Deliberately NOT cached as "skip": identitySelect() below throws for
      // any model missing from this map, so an unkeyable model fails closed
      // at the moment of the write rather than at import time (which would
      // take the whole app down for a model nobody writes).
      select = null;
    }
    if (select) map.set(delegateKey(model.name), select);
  }
  CACHE = map;
  return map;
}

/**
 * The identity select for a scoped delegate (`"practiceSetting"`), or THROW.
 * Called by the fail-closed ownership pre-check; throwing is the fail-closed
 * outcome and must never be softened into a skip.
 */
export function identitySelect(delegate: string): IdentitySelect {
  const found = cache().get(delegate);
  if (!found) throw new ModelIdentityError(delegate);
  return found;
}

/** Every delegate this module can identify — for the acceptance sweep. */
export function identifiableDelegates(): string[] {
  return [...cache().keys()];
}
