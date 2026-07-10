// Birthplace → coordinates + IANA timezone, via Open-Meteo's free geocoding
// API (no key). Privacy: ONLY the place name is sent — never a birth date,
// name, or anything identifying. Historical DST rules for old birth dates are
// applied later by the IANA tz database (via Intl), not by this call.

export type GeocodeResult = {
  lat: number;
  lng: number;
  tz: string;
  label: string; // resolved "City, Region, Country" for confirmation
};

export async function geocodePlace(place: string): Promise<GeocodeResult | null> {
  const q = place.trim();
  if (!q) return null;
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(q);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        name: string;
        latitude: number;
        longitude: number;
        timezone?: string;
        admin1?: string;
        country?: string;
      }[];
    };
    const hit = data.results?.[0];
    if (!hit || typeof hit.latitude !== "number" || !hit.timezone) return null;
    return {
      lat: hit.latitude,
      lng: hit.longitude,
      tz: hit.timezone,
      label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
    };
  } catch {
    return null; // network hiccups degrade to "couldn't find that place"
  }
}
