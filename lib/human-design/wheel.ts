// The mechanical facts of the Human Design bodygraph: the gate wheel (where
// each gate sits on the ecliptic), which center each gate belongs to, and the
// 36 gate-pair channels. These are factual/mechanical mappings (like an
// astrological wheel), not copyrighted descriptions — all explanatory copy
// lives in meaning.ts and is original.

export const CENTERS = [
  "Head",
  "Ajna",
  "Throat",
  "G",
  "Heart",
  "Sacral",
  "Spleen",
  "SolarPlexus",
  "Root",
] as const;
export type Center = (typeof CENTERS)[number];

// Motors can carry energy to the Throat (drives Type).
export const MOTOR_CENTERS: Center[] = ["Heart", "Sacral", "SolarPlexus", "Root"];

// The zodiacal order of gates around the mandala. Gate 41 opens the wheel at
// ecliptic longitude 302° (02°00' Aquarius); each gate spans 5.625° and each
// of its 6 lines spans 0.9375°. (Cross-check: gate 25 then starts at 28°15'
// Pisces — the standard anchor.)
export const WHEEL_START = 302.0;
export const GATE_SPAN = 360 / 64; // 5.625°
export const LINE_SPAN = GATE_SPAN / 6; // 0.9375°

export const GATE_ORDER: number[] = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60,
];

export const GATE_CENTER: Record<number, Center> = {
  64: "Head", 61: "Head", 63: "Head",
  47: "Ajna", 24: "Ajna", 4: "Ajna", 17: "Ajna", 43: "Ajna", 11: "Ajna",
  62: "Throat", 23: "Throat", 56: "Throat", 16: "Throat", 20: "Throat",
  31: "Throat", 8: "Throat", 33: "Throat", 35: "Throat", 12: "Throat", 45: "Throat",
  1: "G", 2: "G", 7: "G", 10: "G", 13: "G", 15: "G", 25: "G", 46: "G",
  21: "Heart", 26: "Heart", 40: "Heart", 51: "Heart",
  3: "Sacral", 5: "Sacral", 9: "Sacral", 14: "Sacral", 27: "Sacral",
  29: "Sacral", 34: "Sacral", 42: "Sacral", 59: "Sacral",
  18: "Spleen", 28: "Spleen", 32: "Spleen", 44: "Spleen",
  48: "Spleen", 50: "Spleen", 57: "Spleen",
  6: "SolarPlexus", 22: "SolarPlexus", 30: "SolarPlexus", 36: "SolarPlexus",
  37: "SolarPlexus", 49: "SolarPlexus", 55: "SolarPlexus",
  19: "Root", 38: "Root", 39: "Root", 41: "Root", 52: "Root",
  53: "Root", 54: "Root", 58: "Root", 60: "Root",
};

// The 36 channels as gate pairs. A channel is active when both gates are
// activated (across Personality + Design combined); its two centers define.
export const CHANNELS: [number, number][] = [
  [64, 47], [61, 24], [63, 4], // Head — Ajna
  [17, 62], [43, 23], [11, 56], // Ajna — Throat
  [20, 57], [16, 48], // Throat — Spleen
  [20, 34], // Throat — Sacral
  [20, 10], [31, 7], [8, 1], [33, 13], // Throat — G
  [45, 21], // Throat — Heart
  [35, 36], [12, 22], // Throat — Solar Plexus
  [25, 51], // G — Heart
  [10, 34], [15, 5], [2, 14], [46, 29], // G — Sacral
  [10, 57], // G — Spleen
  [26, 44], // Heart — Spleen
  [40, 37], // Heart — Solar Plexus
  [59, 6], // Sacral — Solar Plexus
  [27, 50], [34, 57], // Sacral — Spleen
  [42, 53], [3, 60], [9, 52], // Sacral — Root
  [18, 58], [28, 38], [32, 54], // Spleen — Root
  [30, 41], [55, 39], [49, 19], // Solar Plexus — Root
];

export type GateLine = { gate: number; line: number; longitude: number };

// Ecliptic longitude → gate + line on the mandala.
export function gateFromLongitude(longitude: number): GateLine {
  const pos = (((longitude - WHEEL_START) % 360) + 360) % 360;
  const idx = Math.min(63, Math.floor(pos / GATE_SPAN));
  const line = Math.min(6, Math.floor((pos - idx * GATE_SPAN) / LINE_SPAN) + 1);
  return { gate: GATE_ORDER[idx], line, longitude: Math.round(longitude * 10000) / 10000 };
}

export function channelKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
