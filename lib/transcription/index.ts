import type { TranscriptionProvider, NormalizedTranscript, SpeakerRole } from "./types";
import { AssemblyAIProvider } from "./assemblyai";

export type { TranscriptionProvider, NormalizedTranscript };

// The factory — swapping vendors is one env var (SESSION-PIPELINE §5).
export function getTranscriptionProvider(): TranscriptionProvider {
  switch (process.env.TRANSCRIPTION_PROVIDER ?? "assemblyai") {
    case "assemblyai":
      return new AssemblyAIProvider();
    default:
      throw new Error(`unknown transcription provider: ${process.env.TRANSCRIPTION_PROVIDER}`);
  }
}

// Speaker → role heuristic (§5): the voice that talks more across the
// session AND tends to open is usually the practitioner. Provisional only —
// the review UI shows the mapping with one tap to flip; nothing is
// auto-committed without the review step.
export function mapSpeakers(t: NormalizedTranscript): Record<string, SpeakerRole> {
  const talk = new Map<string, number>();
  for (const u of t.utterances) talk.set(u.rawSpeakerLabel, (talk.get(u.rawSpeakerLabel) ?? 0) + (u.endMs - u.startMs));
  const labels = [...talk.keys()];
  if (labels.length === 0) return {};
  if (labels.length === 1) return { [labels[0]]: "PRACTITIONER" };
  const first = t.utterances[0]?.rawSpeakerLabel;
  const byTalk = [...talk.entries()].sort((a, b) => b[1] - a[1]);
  // Prefer the bigger talker; break near-ties (<10% apart) toward the opener.
  const practitioner =
    byTalk[0][1] > 0 && (byTalk[0][1] - (byTalk[1]?.[1] ?? 0)) / byTalk[0][1] < 0.1 && first ? first : byTalk[0][0];
  const mapping: Record<string, SpeakerRole> = {};
  for (const l of labels) mapping[l] = l === practitioner ? "PRACTITIONER" : "CLIENT";
  return mapping;
}
