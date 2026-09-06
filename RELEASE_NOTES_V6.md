# Release Notes — v6.0.0

## Purpose

v6 moves the project from a primarily keyword-driven specialist finder to a context-aware hybrid routing engine while keeping the operational scope narrow: **help contact-centre staff find the most appropriate LIPS consultant quickly**.

Booking remains intentionally out of scope.

## Routing improvements

### Context before matching

The parser now distinguishes:

- current/present symptoms;
- explicit denial/absence;
- past history;
- resolved symptoms;
- family/other-person context;
- possible/uncertain wording.

These states are applied before specialty scoring, sub-specialty selection, doctor-profile evidence and urgent guardrails.

### Broader symptom vocabulary

`clinical-knowledge/symptoms.json` contains 101+ concepts with common English phrases. This covers gaps that cannot be expected from a hospital directory alone, including back pain/radicular wording and patient-style descriptions such as heart racing or buzzing in the ear.

The layer supplements, rather than replaces, current LIPS directory evidence.

### Live LIPS profile knowledge

The directory updater now scans public profile text for known ontology concepts and stores canonical profile evidence. Live condition/expertise/sub-specialty terms can also route dynamically even when they are not in a hard-coded route rule.

### Better doctor ranking

Doctor ordering now considers:

1. specialty eligibility;
2. exact/related sub-specialty;
3. anatomical scope incompatibility;
4. structured condition/expertise evidence;
5. concept-to-profile evidence;
6. LIPS Healthcare location preference only among clinically suitable choices.

### Clarification instead of guessing

Ambiguous supported concepts can return one short question with clickable options. This is intentionally limited to cases where one extra fact can materially improve the route.

## Voice dictation

A microphone button has been added beside the note field. It uses the browser's speech-recognition implementation, requests UK English, supports interim/final transcription, handles permission/network/no-speech failures, and falls back to typing when unsupported.

`Permissions-Policy: microphone=(self)` is set by the application. No audio file is stored by the application.

## Safety

The emergency guardrail library includes conservative patterns for examples such as possible stroke, severe chest symptoms, severe breathing difficulty, anaphylaxis, prolonged seizure and a cauda-equina combination. Routine consultant cards are hidden when an emergency rule fires so the UI does not compete with escalation messaging.

These rules are **not a clinical protocol** and require LIPS/organisation clinical-governance approval before operational use.

## Deployment architecture

Vercel runs the lightweight Express routing app. Playwright crawling remains delegated to GitHub Actions. The action now also runs `npm run check` before tests/crawling and still refuses to publish a directory that fails the coverage gate.

## QA

Release build status at packaging:

- `npm test`: 83/83 PASS
- `npm run check`: PASS
- clinical knowledge JSON validation: PASS
- direct Vercel Express export regression: PASS
- voice UI/fallback regression: PASS
- context/negation/history/family/resolved/uncertainty regressions: PASS
- profile enrichment and crawler parser regressions: PASS

No software release can be guaranteed to contain zero defects. This build converts the known critical edge cases into automated regressions and deliberately returns uncertainty rather than forcing a specialty when evidence is weak.
