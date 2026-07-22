import type { ModuleDefinition, IntakeField } from "./types";
import { BodyGraphPanel } from "@/components/modules/BodyGraphPanel";
import { ArchetypalKeysPanel } from "@/components/modules/ArchetypalKeysPanel";
import { ValuesSpiralPanel } from "@/components/modules/ValuesSpiralPanel";

// PLATFORM Layer 3 — the module registry (spec §5). Every module declares
// itself here; tenants enable/disable/order/label them purely in data
// (TenantModule rows). Phase 2 ships the three structured-content panel
// modules; computed modules (western-natal, numerology, …) arrive with the
// ReadingProvider in Phase 3, session/manual tools in Phase 4.

const BIRTH_FIELDS: IntakeField[] = [
  { key: "birth.date", label: "Date of birth", kind: "date", required: true },
  { key: "birth.time", label: "Time of birth", kind: "time", required: false, timeUnknown: "degrade" },
  { key: "birth.place", label: "Place of birth", kind: "place", required: true },
];

export const MODULES: Record<string, ModuleDefinition> = {
  "body-graph": {
    key: "body-graph",
    class: "COMPUTED",
    defaultLabel: "Body Graph",
    intakeRequirements: BIRTH_FIELDS,
    mapPanel: BodyGraphPanel,
  },
  "archetypal-keys": {
    key: "archetypal-keys",
    class: "COMPUTED",
    defaultLabel: "Archetypal Keys",
    intakeRequirements: BIRTH_FIELDS,
    mapPanel: ArchetypalKeysPanel,
  },
  "values-spiral": {
    key: "values-spiral",
    class: "COMPUTED",
    defaultLabel: "Values Spiral",
    intakeRequirements: [
      {
        key: "values.questions",
        label: "Values reflection",
        kind: "question-set",
        required: true,
        questionSetRef: "values-spiral-v1", // populated verbatim from the tenant's assessment at onboarding build time
      },
    ],
    mapPanel: ValuesSpiralPanel,
  },
};

export function getModule(key: string): ModuleDefinition | null {
  return MODULES[key] ?? null;
}

// The shape a tenant's module rows take everywhere panels/intake are derived.
export type TenantModuleRow = {
  moduleKey: string;
  enabled: boolean;
  position: number;
  settings: unknown;
};

// The renderable panel list for a tenant: enabled rows, in tenant order,
// joined to registry definitions that ship a mapPanel. This single function
// is what the map surfaces consume — toggling a TenantModule row IS the
// feature change (config is data, Rule 0.3).
export function panelsFor(rows: TenantModuleRow[]) {
  return rows
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position)
    .flatMap((r) => {
      const def = getModule(r.moduleKey);
      if (!def?.mapPanel) return [];
      const settings = (r.settings ?? {}) as { displayLabel?: string; panel?: Record<string, string> };
      return [
        {
          key: r.moduleKey,
          Panel: def.mapPanel,
          displayLabel: settings.displayLabel ?? def.defaultLabel,
          copy: settings.panel ?? {},
        },
      ];
    });
}
