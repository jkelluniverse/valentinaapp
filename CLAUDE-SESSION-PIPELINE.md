# Session Capture Pipeline — Build Spec v1.0
### Practitioner Portal · AssemblyAI transcription · Adapter pattern · Multi-input ingestion
Prepared July 21, 2026

---

## 1. What this is

The flagship portal feature: **record or upload a session, and a draft client-map update writes itself.** Audio comes in through any of four doors, gets transcribed with speaker labels by AssemblyAI (behind a swappable adapter), gets structured by a Claude extraction pass, and lands as a *draft* the practitioner reviews and approves before it touches the client record.

Design principles, in priority order:
1. **Practitioner stays the author.** Nothing merges into a client map without explicit approval.
2. **Consent is enforced by the system**, not by policy documents.
3. **Provider-agnostic core.** AssemblyAI today; a one-file swap if that ever changes.
4. **Any recording source works.** Phone, laptop, Pocket, Plaud, Zoom, voice memos — the portal doesn't care where audio comes from.
5. **Audio is a liability, transcripts are an asset.** Default to deleting audio once the transcript is confirmed.

Stack assumptions (matches your existing pattern): Next.js on Railway, Postgres + Prisma, object storage (Railway volume or S3-compatible bucket — recommend Cloudflare R2 for cheap egress), Anthropic API for extraction.

---

## 2. Architecture at a glance

```
┌─────────────── CAPTURE (4 input doors) ───────────────┐
│  A. In-portal recorder   B. File upload               │
│  C. Email-in address     D. Mobile share target       │
└──────────────────────────┬────────────────────────────┘
                           ▼
                 [Consent gate — hard stop]
                           ▼
              Object storage (encrypted at rest)
                           ▼
        ┌── TranscriptionProvider adapter ──┐
        │   AssemblyAIProvider (today)      │──► async job + webhook
        │   (DeepgramProvider — future)     │
        └───────────────┬───────────────────┘
                        ▼
        Normalized transcript (speaker-labeled utterances)
                        ▼
        Claude extraction pass (client-map schema)
                        ▼
        DRAFT map update ──► practitioner review UI
                        ▼                    ▼
                   [Approve]            [Edit/Discard]
                        ▼
        Merge into client map · retention job deletes audio
```

---

## 3. The four input doors

### Door A — In-portal recorder (primary path)
- "Record Session" button on the client's page. Uses the browser `MediaRecorder` API (works on desktop and mobile Safari/Chrome; capture as `audio/webm` or `audio/mp4` depending on browser).
- Chunked upload every 30–60 seconds to storage so a dropped connection or dead battery loses at most a minute, not the session.
- UI shows: recording indicator, elapsed time, client name, consent status badge, pause/stop.
- On stop: file finalized in storage, session row created, pipeline kicks off automatically.
- **Why primary:** zero extra hardware, zero data movement steps, consent gate is unavoidable.

### Door B — File upload (universal fallback)
- Drag-and-drop / file picker on the session page. Accept `mp3, m4a, wav, webm, mp4, aac, flac, ogg` — AssemblyAI ingests all common formats, so do no transcoding; pass files through as-is.
- **This is the Pocket door.** Pocket (and Plaud, Limitless, Apple Voice Memos, Zoom local recordings) all export standard audio files from their apps. The practitioner records on whatever device they like, then shares/exports the file into the portal. We integrate with *every* recorder by integrating with none of them specifically.
- Max file size guard (e.g., 500 MB ≈ several hours of audio); reject video-only files.
- Upload requires selecting **which client** the session belongs to before the pipeline runs.

### Door C — Email-in ingestion (the frictionless device bridge)
- Each practitioner gets a unique ingest address: `sessions-{token}@in.yourportaldomain.com` (Postmark/SendGrid inbound parse, or Cloudflare Email Workers).
- From any device app — including Pocket's share sheet — the practitioner emails the audio file to their address. The webhook receives it, verifies the sender against the practitioner's registered emails, stores the attachment, and creates an **unassigned session** in their inbox.
- Unassigned sessions require the practitioner to pick the client (and confirm consent exists) before transcription runs. Never guess the client.
- Security: token in the address + sender verification + attachment type allowlist. Rotate the token on request.

### Door D — Mobile share target (phase 2, nice-to-have)
- Register the portal PWA as a share target (`share_target` in the web app manifest, Android; iOS via shortcut). "Share → Portal" from Voice Memos or Pocket lands the file directly in Door B's flow.
- Ship Doors A–C first; add D once the PWA exists.

### A note on "deeper" Pocket integration
Pocket's value-add features (its own summaries, mind maps) live in its closed app, and it publishes no developer API to pull transcripts programmatically. Do **not** build against it. The file-export path above is the durable integration — it works today, works for every device on the market, and can't be broken by a vendor's app update. If Pocket ever ships a public API, it becomes just another optional door behind the same pipeline.

---

## 4. Consent gate (non-negotiable, enforced in code)

- `ConsentRecord` per client: signed acknowledgment (checkbox + timestamp + IP, or uploaded signed form), covering recording, transcription by a third-party processor, and retention terms.
- **Hard stop:** the pipeline will not transcribe any session for a client without an active consent record. Doors A/B/D block at submission; Door C parks the file as unassigned until consent is confirmed.
- Per-session confirmation: starting a recording shows "Consent on file for {client} — confirmed verbally today?" [Yes, both parties agree].
- State-law flag: practitioner profile stores their state; client record optionally stores the client's state (for remote sessions). If either is an all-party-consent state (CA, FL, WA, IL, etc.), the UI reminds the practitioner that *both* parties must agree — which the consent record + verbal confirmation already satisfies, but the reminder keeps them deliberate. (One conversation with an attorney before launch to bless the consent language; this spec builds the rails, counsel writes the words.)

---

## 5. The adapter pattern

One interface, provider implementations behind it, and a **normalized transcript schema** so nothing downstream ever knows which vendor ran.

```typescript
// lib/transcription/types.ts

export interface NormalizedUtterance {
  speaker: "PRACTITIONER" | "CLIENT" | "UNKNOWN";
  rawSpeakerLabel: string;      // provider's original label, e.g. "A"/"B"
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface NormalizedTranscript {
  provider: string;              // "assemblyai"
  providerJobId: string;
  languageCode: string;
  durationMs: number;
  utterances: NormalizedUtterance[];
  fullText: string;
  costEstimateUsd: number | null;
  raw: unknown;                  // full provider payload, archived for audit
}

export interface TranscriptionProvider {
  readonly name: string;

  /** Submit audio for async transcription. Returns provider job id. */
  submit(input: {
    audioUrl: string;            // time-limited signed URL to our storage
    webhookUrl: string;          // our callback, with signed session token
    diarization: boolean;        // always true for sessions
    languageCode?: string;
  }): Promise<{ jobId: string }>;

  /** Parse + normalize the provider's webhook payload. */
  handleWebhook(payload: unknown): Promise<{
    jobId: string;
    status: "completed" | "error";
    transcript?: NormalizedTranscript;
    errorMessage?: string;
  }>;

  /** Delete transcript/audio from the provider (privacy). */
  deleteRemote(jobId: string): Promise<void>;
}
```

```typescript
// lib/transcription/assemblyai.ts  — the ONLY file that knows AssemblyAI exists

import { TranscriptionProvider, NormalizedTranscript } from "./types";

export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai";
  private apiKey = process.env.ASSEMBLYAI_API_KEY!;
  private base = "https://api.assemblyai.com/v2";

  async submit({ audioUrl, webhookUrl, diarization = true, languageCode }) {
    const res = await fetch(`${this.base}/transcript`, {
      method: "POST",
      headers: { authorization: this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: diarization,   // diarization: +$0.02/hr
        speakers_expected: 2,          // hint: practitioner + client
        webhook_url: webhookUrl,
        language_code: languageCode,
      }),
    });
    if (!res.ok) throw new Error(`AssemblyAI submit failed: ${res.status}`);
    const data = await res.json();
    return { jobId: data.id };
  }

  async handleWebhook(payload: any) {
    // Webhook only signals completion; fetch the full transcript by id.
    const res = await fetch(`${this.base}/transcript/${payload.transcript_id}`, {
      headers: { authorization: this.apiKey },
    });
    const t = await res.json();
    if (t.status === "error") {
      return { jobId: t.id, status: "error" as const, errorMessage: t.error };
    }
    return { jobId: t.id, status: "completed" as const, transcript: this.normalize(t) };
  }

  private normalize(t: any): NormalizedTranscript {
    return {
      provider: this.name,
      providerJobId: t.id,
      languageCode: t.language_code ?? "en",
      durationMs: (t.audio_duration ?? 0) * 1000,
      fullText: t.text ?? "",
      utterances: (t.utterances ?? []).map((u: any) => ({
        speaker: "UNKNOWN",          // mapped to roles in a later step
        rawSpeakerLabel: u.speaker,  // "A" | "B"
        text: u.text,
        startMs: u.start,
        endMs: u.end,
        confidence: u.confidence ?? null,
      })),
      costEstimateUsd: t.audio_duration ? (t.audio_duration / 3600) * 0.23 : null,
      raw: t,
    };
  }

  async deleteRemote(jobId: string) {
    await fetch(`${this.base}/transcript/${jobId}`, {
      method: "DELETE",
      headers: { authorization: this.apiKey },
    });
  }
}
```

```typescript
// lib/transcription/index.ts — the factory. Swapping providers = changing one env var.
import { AssemblyAIProvider } from "./assemblyai";

export function getTranscriptionProvider(): TranscriptionProvider {
  switch (process.env.TRANSCRIPTION_PROVIDER ?? "assemblyai") {
    case "assemblyai": return new AssemblyAIProvider();
    // case "deepgram": return new DeepgramProvider();  // future, ~1 file
    default: throw new Error("Unknown transcription provider");
  }
}
```

**Speaker → role mapping:** diarization returns anonymous labels (A/B). After transcription, run a cheap heuristic (the speaker who talks more across the session and speaks first is usually the practitioner) and show the mapping in the review UI with one tap to flip it. Never auto-commit role labels without the review step. *(Verify the exact request/response field names against AssemblyAI's current API reference at build time — treat the code above as the pattern, not gospel.)*

---

## 6. Extraction pass (transcript → draft client-map update)

One Claude API call per session, with the normalized transcript and a strict JSON schema:

```json
{
  "session_summary": "3–5 sentence neutral summary of what was discussed",
  "belief_statements": [
    { "statement": "verbatim or near-verbatim new belief statement", "context": "when/why it arose" }
  ],
  "themes": ["short theme labels"],
  "client_goals_mentioned": ["..."],
  "action_items": [ { "owner": "client|practitioner", "item": "..." } ],
  "follow_up_questions": ["questions worth revisiting next session"],
  "notable_quotes": [ { "speaker": "client", "quote": "...", "timestamp_ms": 0 } ],
  "flags": ["anything the practitioner should review carefully, e.g. unclear audio segments"]
}
```

Extraction rules (encode these in the system prompt):
- **Describe, never interpret.** The extraction records what was said in the client's own words. It makes no claims about mechanisms, outcomes, or the validity of any modality — claims discipline lives here in code, not just in marketing.
- No diagnosis-adjacent language. If the transcript contains crisis-relevant content, set a flag for the practitioner's attention rather than summarizing it away.
- Everything is a **draft**. Output feeds the review UI, never writes directly.

Cost: a 60-minute session ≈ 8–10k words of transcript ≈ well under $0.10–0.30 per extraction on a mid-tier model. Total pipeline cost per session (transcription + extraction) lands around **$0.30–0.50** — build $1/session into your care-plan math and you're safely padded.

---

## 7. Data model (Prisma sketch)

```prisma
model Session {
  id            String   @id @default(cuid())
  practitionerId String
  clientId      String?            // nullable: email-in arrives unassigned
  source        SessionSource      // PORTAL_RECORDER | UPLOAD | EMAIL_IN | SHARE
  status        SessionStatus      // AWAITING_CLIENT | AWAITING_CONSENT | TRANSCRIBING |
                                   // EXTRACTING | REVIEW | MERGED | DISCARDED | ERROR
  recordedAt    DateTime
  audio         AudioAsset?
  transcript    Transcript?
  mapDraft      MapDraft?
  createdAt     DateTime @default(now())
}

model AudioAsset {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  storageKey  String               // object storage path
  mimeType    String
  bytes       Int
  durationMs  Int?
  deletedAt   DateTime?            // set by retention job
}

model Transcript {
  id             String  @id @default(cuid())
  sessionId      String  @unique
  provider       String
  providerJobId  String
  languageCode   String
  durationMs     Int
  fullText       String  @db.Text
  utterances     Json                // NormalizedUtterance[]
  speakerMapping Json                // { "A": "PRACTITIONER", "B": "CLIENT" }
  remoteDeletedAt DateTime?          // provider-side deletion confirmed
}

model MapDraft {
  id          String      @id @default(cuid())
  sessionId   String      @unique
  payload     Json                   // extraction schema above
  status      DraftStatus            // PENDING | EDITED | APPROVED | DISCARDED
  approvedAt  DateTime?
  editedPayload Json?                // practitioner's edits before merge
}

model ConsentRecord {
  id          String   @id @default(cuid())
  clientId    String
  method      String                 // "e-sign" | "uploaded-form"
  signedAt    DateTime
  documentKey String?                // stored signed form
  revokedAt   DateTime?
}
```

---

## 8. Pipeline flow (happy path, Door A)

1. Practitioner hits Record on client page → consent check passes → verbal-confirmation prompt → recording starts, chunks upload.
2. Stop → `Session` created (`TRANSCRIBING`), audio finalized in storage.
3. Server generates a signed, time-limited URL to the audio and calls `provider.submit()` with the webhook URL (webhook URL contains a signed token binding it to the session — reject unsigned callbacks).
4. AssemblyAI webhook fires (typically minutes) → `handleWebhook()` normalizes → `Transcript` stored → speaker heuristic sets provisional role mapping → `provider.deleteRemote()` scrubs the vendor copy.
5. Extraction job runs → `MapDraft` stored → status `REVIEW` → practitioner notified ("Session with {client} is ready to review").
6. Review UI: summary + extracted items side-by-side with the transcript (click any item → jumps to that utterance). Practitioner edits/deletes items, flips speaker mapping if wrong, then **Approve & merge**.
7. Merge writes approved items into the client map, stamped `source: session {date}`.
8. Retention job (nightly): per practitioner setting — `delete audio after approval` (recommended default), `keep 30/90 days`, or `keep indefinitely`. Deletion sets `deletedAt`, hard-deletes the object, keeps the transcript.

Failure paths: provider error → status `ERROR` + retry button (audio still in storage); webhook never arrives → poll job status after 30 min as backstop; extraction failure → transcript still available, retry extraction independently.

---

## 9. Security & privacy checklist

- Encryption in transit (TLS everywhere) and at rest (bucket-level encryption).
- Signed, expiring URLs for all audio access; no public objects, ever.
- Webhook endpoints verify signed tokens; ingest email verifies sender + token.
- Provider-side deletion after normalization (step 4) — the vendor holds session audio for minutes, not months. Sign AssemblyAI's BAA anyway; it costs nothing and strengthens the story.
- API keys in Railway env vars only; separate keys per environment.
- Audit trail: who approved which draft, when (already implicit in `MapDraft.approvedAt` + user session).
- **Never** use real session data in demos, tests, or marketing. Seed a fictional practitioner + clients for all demo instances.
- Attorney pass on: consent language, retention policy wording, and whether any target practitioners fall under HIPAA or state health-record rules.

---

## 10. Build order

| Phase | Scope | Est. effort |
|---|---|---|
| **1. Core pipeline** | Adapter + AssemblyAI provider, Door B (upload), storage, webhook, normalized transcript, Prisma models | 1 week |
| **2. Extraction + review** | Claude extraction pass, review/approve UI, merge into client map, speaker-role mapping | 1 week |
| **3. Consent + retention** | ConsentRecord flow, hard gate, retention settings + nightly job, provider-side deletion | 3–4 days |
| **4. Door A** | In-portal recorder with chunked upload | 3–4 days |
| **5. Door C** | Email-in ingestion + unassigned-session inbox | 2–3 days |
| **6. Polish** | Notifications, error/retry UX, cost dashboard, Door D share target | ongoing |

Phases 1–2 alone give you a demoable "upload a session, watch the map draft itself" — that's your September 23rd demo. Doors A and C make it daily-driver smooth for founding clients in October.

---

## 11. Open decisions for Jacob

1. **Object storage:** Cloudflare R2 (recommended: S3-compatible, no egress fees) vs. Railway volume (simpler, less durable).
2. **Default retention:** I recommend "delete audio on approval, keep transcript" as the shipped default — confirm you agree.
3. **Ingest email domain:** needs a subdomain + inbound mail service (Postmark inbound is the easy button).
4. **Extraction model tier:** start mid-tier for cost; upgrade per-practitioner if quality complaints surface.
5. **Whether Villa Siesta's Railway/Postgres patterns get reused directly** (recommended — same deployment shape, new repo, zero shared infrastructure per your entity-separation rule).
