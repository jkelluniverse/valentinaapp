# C14-REMARKABLE + C19 verify — 2026-07-21T01:10:13.049Z

## R.1 · Inbound ingest
- ✓ strangers bounce silently
- ✓ allowlisted page lands as a draft
- ✓ original PDF stored whole

## R.2 · Transcription
- ✓ transcript produced — claude-opus-4-8 · handwriting-1
- ✓ faithful to the page (boundaries line)
- ✓ bilingual line kept verbatim

## R.3 · Matching
- ✓ calendar+name pre-selects Maria — confidence=CONFIDENT

## R.4 · Apply + map

## REC.1 · Consent
- ✓ no consent → gate closed
- ✓ consent grant opens it

## REC.2/3 · Recording ingest + review
- ✓ webhook payload lands as a draft
- ✓ tag+calendar matches Maria — confidence=CONFIDENT
- ✓ consent gate blocks a non-consented client
- ✓ apply succeeds with redaction
- ✓ struck passage never persists
- ✓ kept passages persist with timestamps
- ✓ no crisis flag on a calm session
- ✓ redactedCount recorded

## Extraction · her hand + their words as evidence
- ✓ extraction ran — created=2 updated=0
- nodes citing her handwriting: 2 ✓
- nodes citing spoken moments: 2 ✓
- ✓ her speech never becomes client-psyche evidence
- ✓ crisis layer flags the transcript

## REC.5 · Spoken search
- ✓ a spoken phrase is findable

ALL CHECKS PASS
