import { PractitionerShell } from "./journey-v1/PractitionerShell";
import { ClientShell } from "./journey-v1/ClientShell";
import { PractitionerShell as DashPractitionerShell } from "./dashboard-v1/PractitionerShell";
import { ClientShell as DashClientShell } from "./dashboard-v1/ClientShell";

// PLATFORM Layer 1 — the layout registry. A tenant's layoutKey selects one of
// these trees at the portal roots; all layouts consume identical feature
// components (layouts arrange, features behave). journey-v1 is Valentina's
// portal exactly as it stands, and is immutable while she lives on it —
// improvements become journey-v2, her opt-in. dashboard-v1 arrives in
// Phase 1; canvas-v1 last (Phase 6).

export type LayoutKey = "journey-v1" | "dashboard-v1";

const LAYOUTS = {
  "journey-v1": { PractitionerShell, ClientShell },
  "dashboard-v1": { PractitionerShell: DashPractitionerShell, ClientShell: DashClientShell },
} as const;

export function getLayout(key: string) {
  return LAYOUTS[(key in LAYOUTS ? key : "journey-v1") as LayoutKey];
}
