# LIPS Specialist Finder v4

Production-oriented contact-centre routing assistant for the public LIPS specialist directory.

The application is intentionally focused on one job: take an English symptom description and help a staff member reach the most appropriate **specialty → sub-specialty → specialist** quickly. It does not perform booking and does not diagnose patients.

## What changed in v4

- Faster live-directory updates: sitemap-first discovery, bounded discovery rounds, blocked heavy assets and concurrent profile workers.
- Failed profiles are retried once without rerunning successful profiles.
- Admin shows live update stage, processed/total, successes, failures, retries and percentage progress.
- English-only symptom routing.
- Negation-aware matching: `no chest pain`, `denies palpitations`, `without shortness of breath`, etc. are excluded from specialty scoring and doctor-profile evidence.
- Negated urgent phrases are also excluded from urgent flags.
- LIPS Healthcare clinic location extraction from the clinician's **Locations** section only; the global `Our Location` footer is ignored.
- Clinically equivalent doctors who are verified as consulting at LIPS Healthcare are prioritised.
- Exact sub-specialty fit always beats the commercial location preference.
- Word-boundary matching prevents bugs such as matching `ENT` inside `Preventive`.
- Cleaner profile parsing so location/address text cannot become a sub-specialty or expertise tag.
- Live LIPS sub-speciality labels can participate in routing even when they are newer than the curated rules.
- Multi-specialty profiles are indexed as a primary specialty plus secondary specialties, so a dual-listed consultant is not hidden from a valid route.
- Diabetes and Endocrinology are routed separately to match the current LIPS profile taxonomy; Geriatrics is also covered explicitly.
- Coverage gates protect a healthy directory from a partial crawl.
- UI shows which symptoms were used and which were ignored because they were denied/absent.
- No patient symptom text is written to application logs.

## Routing order

The ranking is deliberately separated into clinical tiers:

1. Exact/aliased sub-specialty match.
2. Related sub-specialty or strong structured profile evidence.
3. Specialty-only match.

Inside the same clinical tier, a clinician verified as consulting at LIPS Healthcare is listed first when `PREFER_LIPS_HEALTHCARE=true`. The location preference cannot move a general specialist above an exact sub-specialty match.

## Negation examples

Expected behaviour:

- `No chest pain.` → no Cardiology route.
- `No chest pain. Persistent knee pain and swelling.` → Trauma & Orthopaedics → Knee.
- `Denies chest pain, palpitations or shortness of breath, but reports acid reflux.` → Gastroenterology.
- `Chest pain on exertion but no palpitations.` → Cardiology.
- `No improvement in chest pain.` → chest pain is still treated as present.
- `No chest pain with palpitations.` → chest pain is denied; palpitations remain present.
- `No pain with urination.` → the urination context stays inside the denied symptom and does not force Urology.
- `Not only chest pain but palpitations.` → Cardiology; `not only` is not treated as negation.

## LIPS Healthcare location preference

The scraper parses only the doctor's `Locations` section. It stores:

```json
{
  "locations": [
    {
      "type": "Private",
      "name": "LIPS Healthcare, Battersea Power Station",
      "address": "...",
      "email": "...",
      "phone": "...",
      "website": "..."
    }
  ],
  "locationVerified": true,
  "worksAtLipsHealthcare": true
}
```

If the scraper cannot reliably parse the clinician location section, `locationVerified` is false and the previous verified location data is preserved rather than guessing.

## Run locally

Requires Node.js 20+.

```bash
npm install
npx playwright install chromium
npm test
npm start
```

Open:

- Main tool: `http://localhost:10000/`
- Admin: `http://localhost:10000/admin`
- Liveness: `http://localhost:10000/health`
- Readiness: `http://localhost:10000/ready`

## Before live use

The repository includes only a small bootstrap cache. It is deliberately marked as incomplete. Before operational use:

1. Configure a persistent `DATA_DIR`.
2. Set a strong `ADMIN_PASSWORD`.
3. Run `npm test`.
4. Run a live LIPS update from `/admin` or `npm run update`.
5. Confirm the coverage gate passes.
6. Confirm `/ready` returns HTTP 200.
7. Review the admin counts for specialists, specialties, verified locations and LIPS-clinic specialists.
8. Test a small set of known clinical routing cases with a LIPS clinician before exposing the tool to the contact centre.

## Environment variables

See `.env.example`.

Important production settings:

- `PREFER_LIPS_HEALTHCARE=true` — LIPS clinic is a tie-breaker inside the same clinical tier.
- `REQUIRE_READY_DIRECTORY=true` — production routing returns 503 until the live directory passes the configured coverage gate.
- `MIN_UPDATE_RECORDS=100` — minimum safe crawl size.
- `MIN_UPDATE_SPECIALTIES=20` — minimum specialty coverage.
- `MIN_PREVIOUS_RETENTION_RATIO=0.85` — rejects a crawl that unexpectedly loses too much of the previous directory.
- `AUTO_UPDATE_ON_START=true` — useful on a long-running service with persistent disk.
- `SCRAPE_CONCURRENCY=3` — parallel profile workers. Keep 3 on small Render instances; increase cautiously only with more memory.
- `SCRAPE_RETRY_CONCURRENCY=2` — lower-concurrency retry pass for transient failures.
- `DISCOVERY_STABLE_ROUNDS=4` — stops directory discovery once repeated rounds stop finding new profiles.

## Privacy and clinical boundary

Do not enter names, phone numbers, dates of birth, medical record numbers or other patient identifiers. The tool is a directory-routing assistant, not a diagnostic system. Urgent symptom flags are guardrails only; organisational clinical and emergency protocols remain authoritative.
