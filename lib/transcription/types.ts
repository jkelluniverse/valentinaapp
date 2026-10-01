// SESSION-PIPELINE §5 — the transcription adapter surface. One interface,
// providers behind it, a normalized transcript so nothing downstream ever
// knows which vendor ran. AssemblyAI is implementation #1.

export type SpeakerRole = "PRACTITIONER" | "CLIENT" | "UNKNOWN";

export interface NormalizedUtterance {
  speaker: SpeakerRole;
  rawSpeakerLabel: string; // provider's original label, e.g. "A"/"B"
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface NormalizedTranscript {
  provider: string;
  providerJobId: string;
  languageCode: string;
  durationMs: number;
  utterances: NormalizedUtterance[];
  fullText: string;
  costEstimateUsd: number | null;
  raw: unknown; // full provider payload, archived for audit
}

export interface TranscriptionProvider {
  readonly name: string;

  /** Submit audio for async transcription. Returns the provider job id. */
  submit(input: {
    audioUrl: string; // time-limited signed URL into our storage
    webhookUrl: string; // our callback, carrying a signed capture token
    diarization: boolean; // always true for sessions
    languageCode?: string;
  }): Promise<{ jobId: string }>;

  /** Fetch + normalize a completed job (webhooks only signal completion). */
  fetchResult(jobId: string): Promise<
    | { status: "completed"; transcript: NormalizedTranscript }
    | { status: "error"; errorMessage: string }
    | { status: "pending" }
  >;

  /** Delete transcript/audio from the provider (privacy — vendor holds
   *  session audio for minutes, not months). */
  deleteRemote(jobId: string): Promise<void>;
}
