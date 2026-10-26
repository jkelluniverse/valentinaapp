import type { ComponentType } from "react";
import type { HumanDesignChart } from "@prisma/client";
import type { SpherePosition } from "@/lib/gene-keys";
import type { SpiralScore } from "@/lib/spiral";

// PLATFORM Layer 3 — the modality module vocabulary (spec §5). Module keys
// are generic and trademark-free (Rule 0.4): a practitioner's own branded
// language lives in TenantModule.settings, never in code.

export type ModuleClass = "COMPUTED" | "SESSION" | "MANUAL_TOOL";

export type IntakeFieldKind =
  | "text"
  | "email"
  | "date"
  | "time"
  | "place"
  | "select"
  | "textarea"
  | "question-set";

export type IntakeField = {
  key: string; // "birth.date", "values.questions", ...
  label: string; // neutral platform copy; tenant labels override in data
  kind: IntakeFieldKind;
  required: boolean;
  // For time-of-birth style fields: what this module does when the value is
  // unknown — compute a partial reading ("degrade") or hide its panel ("hide").
  timeUnknown?: "degrade" | "hide";
  // question-set fields point at a versioned set defined in module data.
  questionSetRef?: string;
};

// The data a client map page gathers once and offers to every panel; each
// panel picks what it needs and renders nothing when its data is absent.
export type MapPanelData = {
  chart: HumanDesignChart | null;
  spheres: SpherePosition[];
  spiralScore: (SpiralScore & { practitionerCenter?: string }) | null;
  spiralReviewed: boolean;
  // Phase 3 — computed readings by kind (payload of the client's COMPLETE
  // Reading rows). Absent kinds render as a quiet pending line.
  readings?: Record<string, unknown>;
};

// Tenant-entered panel copy (TenantModule.settings.panel) — the practitioner's
// words, stored as data. Every field has a neutral default in the component.
export type PanelCopy = {
  heading?: string;
  sub?: string;
  pending?: string;
};

export type MapPanelProps = {
  displayLabel: string; // tenant's label for the modality
  copy: PanelCopy;
  data: MapPanelData;
};

export interface ModuleDefinition {
  key: string;
  class: ModuleClass;
  defaultLabel: string; // neutral: "Body Graph", "Archetypal Keys", ...
  intakeRequirements: IntakeField[];
  // COMPUTED modules will declare readingRequests in Phase 3 (ReadingProvider).
  // Valentina's three panels are structured-content modules (spec §5.1): the
  // data keeps arriving exactly as it does today; the module system only
  // renders it. No computed wiring here by decision, not omission.
  mapPanel?: ComponentType<MapPanelProps>;
}
