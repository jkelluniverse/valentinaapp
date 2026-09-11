// Birthplace → coordinates + IANA timezone, via Open-Meteo's free geocoding
// API (no key). Privacy: ONLY the place name is sent — never a birth date,
// name, or anything identifying. Historical DST rules for old birth dates are
// applied later by the IANA tz database (via Intl), not by this call.
//
// Robustness: Open-Meteo matches CITY names — "Ponce, Puerto Rico" as one
// string can return nothing, while a bare "Ponce" happily returns a same-named
// town in the wrong country. So: try the full string first; on a miss, search
// the city part alone and accept a candidate ONLY if its country/region
// matches the rest of the string. Never guess across countries.

export type GeocodeResult = {
  lat: number;
  lng: number;
  tz: string;
  label: string; // resolved "City, Region, Country" for confirmation
};

type Hit = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  admin1?: string;
  admin2?: string;
  country?: string; // absent for some territories (e.g. Puerto Rico)
  country_code?: string;
};

// Territories Open-Meteo returns with a country_code but no country name.
const CODE_NAMES: Record<string, string> = {
  PR: "Puerto Rico",
  GU: "Guam",
  VI: "U.S. Virgin Islands",
  AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

async function search(q: string, count: number): Promise<Hit[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?count=${count}&language=en&format=json&name=` +
    encodeURIComponent(q);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Hit[] };
  return (data.results ?? []).filter((h) => typeof h.latitude === "number" && h.timezone);
}

function countryName(hit: Hit): string | undefined {
  return hit.country ?? (hit.country_code ? CODE_NAMES[hit.country_code] : undefined);
}

function toResult(hit: Hit): GeocodeResult {
  return {
    lat: hit.latitude,
    lng: hit.longitude,
    tz: hit.timezone!,
    label: [hit.name, hit.admin1, countryName(hit)].filter(Boolean).join(", "),
  };
}

function regionMatches(hit: Hit, hint: string): boolean {
  const h = hint.toLowerCase();
  // The timezone often carries the region too ("America/Puerto_Rico").
  const tzWords = hit.timezone?.replace(/_/g, " ").split("/").pop();
  return [countryName(hit), hit.admin1, hit.admin2, tzWords]
    .filter((x): x is string => Boolean(x))
    .some((x) => h.includes(x.toLowerCase()) || x.toLowerCase().includes(h));
}

export async function geocodePlace(place: string): Promise<GeocodeResult | null> {
  const q = place.trim();
  if (!q) return null;
  try {
    // 1. The full string as typed.
    const full = await search(q, 1);
    if (full[0]) return toResult(full[0]);

    // 2. City part alone — but only a candidate whose country/region agrees
    //    with the rest of the string ("Ponce" + "Puerto Rico"). A city-only
    //    input with no hint still takes the top hit, as before.
    const [head, ...rest] = q.split(",").map((s) => s.trim());
    const hint = rest.join(", ");
    if (!head || head === q) return null;
    const candidates = await search(head, 10);
    const pick = hint ? candidates.find((c) => regionMatches(c, hint)) : candidates[0];
    return pick ? toResult(pick) : null;
  } catch {
    return null; // network hiccups degrade to "couldn't find that place"
  }
}
