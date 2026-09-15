import { createHash } from "crypto";
import { MODULES, type TenantModuleRow } from "@/lib/modules/registry";
import type { IntakeField, ModuleDefinition } from "@/lib/modules/types";

// PLATFORM Phase 2 — the intake schema builder (spec §5, onboarding §1A).
// A tenant's intake form is DERIVED: the union of every enabled module's
// intakeRequirements (deduped by field key), plus tenant custom fields —
// no tenant-specific intake code, ever (onboarding Rule 0.1). This module
// builds the schema only; the client-facing intake UI is the onboarding
// build, which consumes exactly this output.

export type IntakeStep = {
  key: string; // "identity" | "birth" | "module:<key>" | "custom"
  title: string; // neutral platform title, or the tenant's displayLabel
  moduleKey?: string;
  fields: IntakeField[];
};

export type IntakeSchema = {
  steps: IntakeStep[];
  // Drift guard input (onboarding §4.3): same modules + fields → same hash.
  hash: string;
  // The birth-time-unknown path, precomputed for the UI: which enabled
  // modules degrade gracefully without a time, and which hide instead.
  birthTime: { degrades: string[]; hides: string[] };
};

const IDENTITY_FIELDS: IntakeField[] = [
  { key: "identity.fullName", label: "Full name", kind: "text", required: true },
  { key: "identity.preferredName", label: "Preferred name", kind: "text", required: false },
  { key: "identity.email", label: "Email", kind: "email", required: true },
];

export function buildIntakeSchema(
  rows: TenantModuleRow[],
  customFields: IntakeField[] = [],
  registry: Record<string, ModuleDefinition> = MODULES,
): IntakeSchema {
  const enabled = rows
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position)
    .flatMap((r) => {
      const def = registry[r.moduleKey];
      return def ? [{ row: r, def }] : [];
    });

  // Shared (non question-set) requirements, deduped by key in first-seen
  // order — birth data asked once no matter how many modules need it.
  const shared = new Map<string, IntakeField>();
  const degrades: string[] = [];
  const hides: string[] = [];
  for (const { def } of enabled) {
    for (const f of def.intakeRequirements) {
      if (f.kind === "question-set") continue;
      if (!shared.has(f.key)) shared.set(f.key, f);
      if (f.key === "birth.time") {
        if (f.timeUnknown === "degrade") degrades.push(def.key);
        if (f.timeUnknown === "hide") hides.push(def.key);
      }
    }
  }

  const steps: IntakeStep[] = [{ key: "identity", title: "About you", fields: IDENTITY_FIELDS }];
  const birthFields = [...shared.values()].filter((f) => f.key.startsWith("birth."));
  const otherShared = [...shared.values()].filter((f) => !f.key.startsWith("birth."));
  if (birthFields.length > 0) steps.push({ key: "birth", title: "Your birth details", fields: birthFields });
  if (otherShared.length > 0) steps.push({ key: "shared", title: "A few details", fields: otherShared });

  // One sub-step per enabled module that asks its own questions, in tenant
  // order, under the tenant's label (onboarding §3C).
  for (const { row, def } of enabled) {
    const sets = def.intakeRequirements.filter((f) => f.kind === "question-set");
    if (sets.length === 0) continue;
    const settings = (row.settings ?? {}) as { displayLabel?: string };
    steps.push({
      key: `module:${def.key}`,
      title: settings.displayLabel ?? def.defaultLabel,
      moduleKey: def.key,
      fields: sets,
    });
  }

  if (customFields.length > 0) steps.push({ key: "custom", title: "A few more questions", fields: customFields });

  const hash = createHash("sha256")
    .update(JSON.stringify(steps.map((s) => ({ key: s.key, fields: s.fields.map((f) => ({ ...f })) }))))
    .digest("hex")
    .slice(0, 16);

  return { steps, hash, birthTime: { degrades, hides } };
}
