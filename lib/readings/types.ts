// PLATFORM §6 — the ReadingProvider adapter surface. Same pattern, same
// discipline as lib/transcription/ and lib/payments/: one interface, one
// vendor file, env-keyed factory, everything mockable.

export type ReadingRequest = {
  kind: string; // "natal-positions" | "natal-houses" | "numerology-core" | ...
  inputs: Record<string, unknown>; // name, birthDate, birthTime?, lat, lng, ...
};

export type NormalizedReading = {
  provider: string;
  kind: string;
  inputsHash: string; // cache key — dedupe identical computations (Rule 0.6)
  computedAt: string;
  payload: unknown; // normalized result, shape documented per kind
  raw: unknown; // full provider response, archived
};

export interface ReadingProvider {
  readonly name: string;
  supports(kind: string): boolean;
  compute(req: ReadingRequest): Promise<NormalizedReading>;
}
