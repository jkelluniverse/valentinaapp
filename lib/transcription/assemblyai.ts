import type { NormalizedTranscript, TranscriptionProvider } from "./types";

// The ONLY file that knows AssemblyAI exists. Endpoint shapes verified
// against the live docs (llms.txt + API reference) on 2026-07-22:
//   submit:  POST {base}/v2/transcript   body: audio_url, speaker_labels,
//            speakers_expected, webhook_url, webhook_auth_header_name/value,
//            language_code? — auth header: `authorization: <api key>` (raw)
//   fetch:   GET  {base}/v2/transcript/{id} — status: queued | processing |
//            completed | error; utterances[{speaker,text,start,end,confidence}]
//   delete:  DELETE {base}/v2/transcript/{id}
//   webhook: POST with { transcript_id, status: "completed" | "error" }
// ASSEMBLYAI_BASE_URL overrides the host so the pipeline runs end-to-end
// against a local mock; the real key is an env value (server-side only).

const base = () => process.env.ASSEMBLYAI_BASE_URL ?? "https://api.assemblyai.com";
const apiKey = () => {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return k;
};

// Diarization-inclusive pricing, cents-accurate enough for the cost line.
const USD_PER_HOUR = 0.25;

type AaiTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  language_code?: string;
  audio_duration?: number; // seconds
  text?: string;
  utterances?: { speaker: string; text: string; start: number; end: number; confidence?: number }[];
};

export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai";

  async submit({ audioUrl, webhookUrl, diarization, languageCode }: Parameters<TranscriptionProvider["submit"]>[0]) {
    const res = await fetch(`${base()}/v2/transcript`, {
      method: "POST",
      headers: { authorization: apiKey(), "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: diarization,
        speakers_expected: 2, // practitioner + client
        webhook_url: webhookUrl,
        webhook_auth_header_name: "x-veritas-webhook",
        webhook_auth_header_value: process.env.TRANSCRIPTION_WEBHOOK_SECRET ?? "unset",
        ...(languageCode ? { language_code: languageCode } : {}),
      }),
    });
    if (!res.ok) throw new Error(`assemblyai submit failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    return { jobId: data.id };
  }

  async fetchResult(jobId: string) {
    const res = await fetch(`${base()}/v2/transcript/${jobId}`, { headers: { authorization: apiKey() } });
    if (!res.ok) return { status: "error" as const, errorMessage: `fetch failed: ${res.status}` };
    const t = (await res.json()) as AaiTranscript;
    if (t.status === "error") return { status: "error" as const, errorMessage: t.error ?? "provider error" };
    if (t.status !== "completed") return { status: "pending" as const };
    return { status: "completed" as const, transcript: this.normalize(t) };
  }

  private normalize(t: AaiTranscript): NormalizedTranscript {
    return {
      provider: this.name,
      providerJobId: t.id,
      languageCode: t.language_code ?? "en",
      durationMs: (t.audio_duration ?? 0) * 1000,
      fullText: t.text ?? "",
      utterances: (t.utterances ?? []).map((u) => ({
        speaker: "UNKNOWN" as const, // roles mapped by heuristic + review, never auto-committed
        rawSpeakerLabel: u.speaker,
        text: u.text,
        startMs: u.start,
        endMs: u.end,
        confidence: u.confidence ?? null,
      })),
      costEstimateUsd: t.audio_duration ? (t.audio_duration / 3600) * USD_PER_HOUR : null,
      raw: t,
    };
  }

  async deleteRemote(jobId: string) {
    await fetch(`${base()}/v2/transcript/${jobId}`, {
      method: "DELETE",
      headers: { authorization: apiKey() },
    }).catch(() => {
      /* best-effort — the nightly custody rules own retention */
    });
  }
}
