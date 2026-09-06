# LIPS Specialist Finder v6

Context-aware contact-centre routing assistant for the public LIPS specialist directory.

The product has one job: turn a short **English** call note into a clinically sensible **specialty → sub-specialty → consultant shortlist**. It does not book appointments and it does not diagnose patients.

## v6 highlights

- **Context-aware symptoms**, not raw keyword matching. Current, denied, historical, resolved, family/other-person and uncertain mentions are treated differently before scoring.
- **101+ curated clinical concepts and common-language synonyms** supplement the terminology published on LIPS, so wording such as `lower back pain`, `heart racing`, `buzzing in the ear` and `pain shooting down my leg` can be understood even when the exact phrase is not a directory filter.
- **Live LIPS evidence remains authoritative for consultant selection.** Every directory refresh indexes specialty, secondary specialties, sub-specialties, public conditions, expertise, biography and clinician locations. Terms found on live LIPS profiles can participate in routing without waiting for a code release.
- **Profile enrichment** maps common-language concepts found in LIPS biographies to structured conditions/expertise, improving doctor-level evidence.
- **Resilient voice dictation** beside the text box. Native `en-GB` speech recognition is used when available; an optional MediaRecorder + server speech-to-text fallback supports browsers that do not expose native recognition. Spoken fillers and immediate repeated words are conservatively cleaned before routing.
- **Anatomical scope protection.** A knee specialist is not pushed below a foot/ankle specialist merely because both are Orthopaedics; similar separation exists for spine, ENT regions and GI areas.
- **LIPS Healthcare preference remains a safe tie-breaker.** Clinical fit comes first; the clinic preference only separates clinically equivalent choices.
- **One-question clarification** can appear when the note is ambiguous, e.g. generic back pain without enough information to distinguish a spine/radicular pathway.
- **Urgent guardrails** hide routine consultant recommendations when configured emergency patterns are detected. These rules require organisational clinical governance approval before operational use.
- **Vercel-friendly architecture.** The web service only performs routing. GitHub Actions performs the Playwright directory refresh, validates coverage, then commits the refreshed directory so Vercel can redeploy it.

## Context examples

Expected behaviour:

- `No chest pain.` → does **not** route to Cardiology.
- `No chest pain with recurrent palpitations.` → Cardiology / Arrhythmia from the palpitations, not from chest pain.
- `History of chest pain last year but currently acid reflux.` → current reflux drives Gastroenterology.
- `Mother had breast cancer. Patient has knee pain.` → the family-history concept is shown but excluded from patient routing; knee symptoms drive Orthopaedics.
- `Back pain has resolved. Current shoulder pain.` → the resolved back pain is ignored for the current route.
- `Possible thyroid problem.` → Endocrinology evidence is down-weighted and the result is surfaced as uncertain rather than pretending certainty.
- `Lower back pain shooting down the right leg with tingling.` → spine/radicular pathway with Spinal Surgery/Spinal Disorders preference where available.

## Hybrid routing pipeline

```text
Call note (typed or dictated)
        ↓
Context extraction
(current / denied / history / resolved / family / uncertain)
        ↓
Clinical concept + synonym layer
        ↓
Curated specialty/sub-specialty rules
        + live LIPS directory terms
        + live LIPS profile evidence
        ↓
Specialty candidates
        ↓
Sub-specialty fit + anatomical scope checks
        ↓
Doctor-level condition/expertise evidence
        ↓
LIPS Healthcare tie-breaker
        ↓
Short ranked consultant list
```

The external symptom layer is deliberately used to **understand patient wording**, not to invent doctors. A consultant still has to be eligible through the live LIPS directory and its verified taxonomy/profile evidence.

## Clinical knowledge files

- `clinical-knowledge/symptoms.json` — concepts, synonyms, specialty/sub-specialty weights and clarification prompts.
- `clinical-knowledge/red-flags.json` — conservative emergency guardrails.
- `clinical-knowledge/SOURCES.md` — public LIPS/NHS/NICE source notes and governance boundary.

The knowledge layer is separate from `data/specialists.json`, so a LIPS website layout change does not erase the curated symptom vocabulary.

## Voice dictation

v6.1 uses a two-layer voice path:

1. **Native recognition first:** `window.SpeechRecognition` / `window.webkitSpeechRecognition` in UK English when the browser exposes it.
2. **Cross-browser fallback:** if native recognition is unavailable or blocked, the app can record a short audio note with `MediaRecorder` and send it to the same-origin `/api/transcribe` endpoint. The current optional server adapter uses OpenAI speech-to-text when `OPENAI_API_KEY` is configured.

The transcript then passes through a conservative disfluency cleaner before routing. It removes standalone fillers such as `um` / `uh` / `erm` and collapses immediate repetitions such as `he he he has` or `and and`, while retaining clinically important wording such as `no chest pain`.

The application does **not persist audio files**. Native recognition or a configured transcription provider may process audio outside the app, so production use with real patient calls requires the organisation's privacy, information-governance and supplier approval. Staff must always review the transcript before routing.

## Live directory updates

For low-cost demo/Vercel deployments, **do not run Playwright inside the web service**. Use:

`GitHub → Actions → Update LIPS specialist directory → Run workflow`

The workflow:

1. installs dependencies and Chromium;
2. runs static checks and regression tests;
3. crawls the public LIPS directory/profile pages;
4. parses specialties, sub-specialties, profile evidence and clinician locations;
5. enriches profile terms with the v6 symptom ontology;
6. rejects incomplete crawls using the coverage gate;
7. commits only a passing `data/specialists.json` + `data/metadata.json` refresh.

A scheduled refresh is also configured in `.github/workflows/update-lips-directory.yml`.

## Vercel deployment

The Express app is exported directly from `server.js` for Vercel. Configure at least:

```text
ADMIN_PASSWORD=<strong secret>
REQUIRE_READY_DIRECTORY=true
PREFER_LIPS_HEALTHCARE=true
SERVER_SCRAPER_ENABLED=false
AUTO_UPDATE_ON_START=false
```

Do not commit `.env` or `node_modules/`.

After replacing the repository with this v6 build, run the GitHub directory workflow once. The ZIP contains bootstrap data; the action repopulates the repository with the current live LIPS directory. Wait for the green workflow run and subsequent Vercel redeploy, then verify `/ready` returns `ready: true`.

See `VERCEL_DEPLOY.md` for the exact replacement sequence.

## Local QA

Requires Node.js 20+.

```bash
npm install
npm test
npm run check
```

For local live crawling:

```bash
npx playwright install chromium
npm run update
```

For local UI testing, create `.env` from `.env.example` and run:

```bash
npm start
```

## Clinical and privacy boundary

Do not enter patient names, phone numbers, dates of birth, medical-record identifiers or other unnecessary identifiers. This tool is directory-routing support, not diagnosis, triage certification or a substitute for clinician judgement. Red-flag rules and escalation wording must be reviewed and approved by the organisation's clinical governance lead before staff rely on them operationally.
