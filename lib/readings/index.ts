import type { ReadingProvider } from "./types";
import { AstrologyApiProvider } from "./astrology-api";

// PLATFORM §6 — factory keyed to READING_PROVIDER (default astrology-api).
// A second provider slots in here without touching any caller.

export function getReadingProvider(): ReadingProvider {
  const which = process.env.READING_PROVIDER ?? "astrology-api";
  switch (which) {
    case "astrology-api":
      return new AstrologyApiProvider();
    default:
      throw new Error(`unknown READING_PROVIDER: ${which}`);
  }
}

export type { ReadingProvider, ReadingRequest, NormalizedReading } from "./types";
