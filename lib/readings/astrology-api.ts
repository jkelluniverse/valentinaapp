import { createHash } from "crypto";
import type { NormalizedReading, ReadingProvider, ReadingRequest } from "./types";

// The ONLY file that knows astrology-api.io exists (PLATFORM §6, Rule 0.8).
// Endpoint shapes verified against the vendor's own Postman collection
// (https://api.astrology-api.io/best-astrology-api-postman.json) on
// 2026-08-04:
//   auth:       Authorization: Bearer <token>
//   positions:  POST {base}/api/v3/data/positions
//   houses:     POST {base}/api/v3/data/house-cusps
//   numerology: POST {base}/api/v3/numerology/core-numbers
// All POST JSON with { subject: { name, birth_data: { year, month, day,
// hour, minute, second, latitude, longitude } }, options: {...} }.
// ASTROLOGY_API_BASE_URL overrides the host so demos/verifies run against
// a mock; the key is server-side env only (ASTROLOGY_API_KEY) and nothing
// blocks on it being issued.

export function astrologyConfigured(): boolean {
  return Boolean(process.env.ASTROLOGY_API_KEY);
}

function base(): string {
  return process.env.ASTROLOGY_API_BASE_URL ?? "https://api.astrology-api.io";
}

// Canonical cache key: kind + sorted inputs. Identical intake data MUST
// hash identically (the free tier is 50 calls/month — Rule 0.6).
export function hashInputs(kind: string, inputs: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify({ kind, inputs: sorted })).digest("hex").slice(0, 32);
}

type BirthInputs = {
  name?: string;
  birthDate: string; // "YYYY-MM-DD"
  birthTime: string | null; // "HH:MM" | null (time unknown)
  lat: number;
  lng: number;
};

function subjectFor(inputs: BirthInputs) {
  const [y, m, d] = inputs.birthDate.split("-").map(Number);
  // Time-unknown degrade path: positions compute at solar noon (documented
  // approximation); house-dependent kinds must NOT be requested at all —
  // the module layer hides them (timeUnknown: "hide").
  const [hh, mm] = (inputs.birthTime ?? "12:00").split(":").map(Number);
  return {
    name: inputs.name ?? "Client",
    birth_data: {
      year: y,
      month: m,
      day: d,
      hour: hh,
      minute: mm,
      second: 0,
      latitude: inputs.lat,
      longitude: inputs.lng,
    },
  };
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ASTROLOGY_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`astrology-api ${path}: ${res.status}`);
  return res.json();
}

const KINDS: Record<string, { path: string; options: (i: BirthInputs) => Record<string, unknown> }> = {
  "natal-positions": {
    path: "/api/v3/data/positions",
    options: () => ({
      house_system: "P",
      zodiac_type: "Tropic",
      language: "en",
      detail_level: "standard",
      active_points: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"],
      precision: 2,
    }),
  },
  "natal-houses": {
    path: "/api/v3/data/house-cusps",
    options: () => ({ house_system: "P", zodiac_type: "Tropic", precision: 2 }),
  },
  "vedic-positions": {
    path: "/api/v3/data/positions",
    options: () => ({
      house_system: "W",
      zodiac_type: "Sidereal",
      language: "en",
      detail_level: "standard",
      active_points: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"],
      precision: 2,
    }),
  },
  "numerology-core": {
    path: "/api/v3/numerology/core-numbers",
    options: () => ({ system: "pythagorean" }),
  },
};

export class AstrologyApiProvider implements ReadingProvider {
  readonly name = "astrology-api";

  supports(kind: string): boolean {
    return kind in KINDS;
  }

  async compute(req: ReadingRequest): Promise<NormalizedReading> {
    const def = KINDS[req.kind];
    if (!def) throw new Error(`unsupported reading kind: ${req.kind}`);
    const inputs = req.inputs as BirthInputs;
    const raw = await post(def.path, { subject: subjectFor(inputs), options: def.options(inputs) });
    return {
      provider: this.name,
      kind: req.kind,
      inputsHash: hashInputs(req.kind, req.inputs),
      computedAt: new Date().toISOString(),
      payload: raw, // provider response IS the documented payload per kind
      raw,
    };
  }
}
