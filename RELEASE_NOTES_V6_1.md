# LIPS Specialist Finder v6.1 — Voice Reliability Update

## What changed

### Conservative hesitation cleanup
Voice transcripts are cleaned before they enter the clinical routing engine:

- `he he he has chest pain` → `he has chest pain`
- `patient um um has back pain and and tingling` → `patient has back pain and tingling`
- `no no chest pain` → `no chest pain`

The cleaner is deliberately conservative. It removes a small set of standalone filler sounds and immediate repetitions; it does not rewrite the clinical note or invent medical language.

### Cross-browser voice architecture
The microphone now has two modes:

1. Native Web Speech recognition when the browser exposes it.
2. MediaRecorder fallback when native recognition is unavailable or blocked and server speech-to-text is configured.

This makes the architecture suitable for Firefox, Brave failure modes and iPhone/Safari variants rather than relying on Web Speech alone.

### Optional server speech-to-text
The fallback is enabled by adding `OPENAI_API_KEY` to the hosting environment. Audio remains in memory, is forwarded to the transcription provider, and is not written to project storage.

Relevant variables:

```text
VOICE_TRANSCRIPTION_ENABLED=true
OPENAI_API_KEY=<secret>
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
VOICE_MAX_RECORDING_SECONDS=90
VOICE_MAX_AUDIO_BYTES=4000000
VOICE_RATE_LIMIT_MAX=30
```

Do not commit the API key to GitHub.

## Safety / privacy

- Routing stays text-based; audio is only an input convenience.
- Review the transcript before pressing Find Specialist.
- Production use with real patient audio requires organisational privacy / IG / supplier approval for the selected speech provider.
- The typed workflow always remains available.

## QA

- Existing routing/context/scraper regression suite retained.
- New disfluency, negation-preservation, MIME and cross-browser-fallback tests added.
