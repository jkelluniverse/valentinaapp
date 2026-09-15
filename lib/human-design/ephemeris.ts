import {
  AstroTime,
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoVector,
  MakeTime,
  NextMoonNode,
  SearchMoonNode,
  SearchSunLongitude,
  SunPosition,
  type NodeEventInfo,
} from "astronomy-engine";

// Geocentric, true-ecliptic-of-date longitudes — the frame the zodiac (and the
// HD mandala) is defined in. Verified empirically: SunPosition and
// Ecliptic(GeoVector(...)) both return ~0° at the March equinox in 2000 AND
// 2024, so they are of-date, not J2000-fixed.

export const HD_PLANETS = [
  "Sun",
  "Earth",
  "Moon",
  "NorthNode",
  "SouthNode",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
] as const;
export type HdPlanet = (typeof HD_PLANETS)[number];

const BODY_MAP: Partial<Record<HdPlanet, Body>> = {
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto,
};

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function sunLongitude(time: AstroTime): number {
  return norm(SunPosition(time.date).elon);
}

// The lunar node's longitude at an arbitrary time: at an ascending-node event
// the node's longitude IS the Moon's longitude (and +180° at a descending
// event). Node events come ~13.6 days apart and the node drifts slowly
// (~-0.05°/day), so interpolating between the surrounding events lands within
// a small fraction of a degree of the true node.
function nodeLongitude(time: AstroTime): number {
  let ev: NodeEventInfo = SearchMoonNode(time.AddDays(-40));
  let prev = ev;
  while (ev.time.ut < time.ut) {
    prev = ev;
    ev = NextMoonNode(ev);
  }
  const lonAt = (e: NodeEventInfo) => {
    const moonLon = EclipticGeoMoon(e.time).lon;
    return e.kind === 1 ? norm(moonLon) : norm(moonLon + 180);
  };
  const lon1 = lonAt(prev);
  const lon2 = lonAt(ev);
  if (ev.time.ut === prev.time.ut) return lon1;
  const frac = (time.ut - prev.time.ut) / (ev.time.ut - prev.time.ut);
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return norm(lon1 + d * frac);
}

export function planetLongitude(planet: HdPlanet, time: AstroTime): number {
  switch (planet) {
    case "Sun":
      return sunLongitude(time);
    case "Earth":
      return norm(sunLongitude(time) + 180);
    case "Moon":
      return norm(EclipticGeoMoon(time).lon);
    case "NorthNode":
      return nodeLongitude(time);
    case "SouthNode":
      return norm(nodeLongitude(time) + 180);
    default: {
      const vec = GeoVector(BODY_MAP[planet]!, time, true);
      return norm(Ecliptic(vec).elon);
    }
  }
}

export function allLongitudes(time: AstroTime): Record<HdPlanet, number> {
  const out = {} as Record<HdPlanet, number>;
  for (const p of HD_PLANETS) out[p] = planetLongitude(p, time);
  return out;
}

// The Design moment: when the Sun was 88° of arc earlier along the ecliptic
// (~88 days before birth). Searched, not approximated — the Sun's speed varies
// across the year.
export function designTime(birth: Date): AstroTime {
  const birthTime = MakeTime(birth);
  const target = norm(sunLongitude(birthTime) - 88);
  const found = SearchSunLongitude(target, birthTime.AddDays(-120), 60);
  if (!found) throw new Error("design search failed"); // never expected in-range
  return found;
}

export { MakeTime };
export type { AstroTime };
