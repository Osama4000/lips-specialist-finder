# Go-Live QA Checklist — v6

## Automated

- [ ] `npm test` passes (release build: 83/83).
- [ ] `npm run check` passes.
- [ ] `/health` returns 200.
- [ ] `/ready` returns 200 after the GitHub directory refresh.

## Directory / crawler

- [ ] GitHub Action `Update LIPS specialist directory` passes.
- [ ] Coverage gate is `PASSED`.
- [ ] Specialist and specialty counts are credible against current LIPS.
- [ ] Randomly compare 10 stored profiles with LIPS specialty/sub-specialty/conditions.
- [ ] Randomly compare clinician Locations for LIPS Healthcare badges.
- [ ] Confirm global footer text never creates a false LIPS clinician-location flag.
- [ ] Confirm ontology-enriched profile evidence does not create a top-level specialty the doctor is not actually listed under.

## Context routing

- [ ] `No chest pain.` does not route to Cardiology.
- [ ] `No chest pain with recurrent palpitations.` routes from palpitations.
- [ ] `History of chest pain last year but currently acid reflux.` routes to current GI complaint.
- [ ] `Mother had breast cancer. Patient has knee pain.` ignores family context for current patient routing.
- [ ] `Back pain has resolved. Current shoulder pain.` routes from current shoulder complaint.
- [ ] `Possible thyroid problem.` is surfaced as uncertain/down-weighted.
- [ ] `No improvement in chest pain.` still recognises active chest pain.
- [ ] `No pain with urination.` does not force Urology.

## Expanded symptom layer

- [ ] `Lower back pain shooting down the right leg with tingling.` reaches a spine/radicular route.
- [ ] generic back pain can offer the configured one-question clarification when needed.
- [ ] `heart racing` is recognised as palpitations.
- [ ] `buzzing in the ear` is recognised as tinnitus/ENT evidence.
- [ ] a term present in the live LIPS profile directory can participate in routing even without a dedicated static route.

## Doctor shortlist

- [ ] Exact sub-specialty beats specialty-only.
- [ ] Anatomically incompatible narrow specialists are pushed down.
- [ ] Clinically equivalent LIPS Healthcare consultant ranks above an equivalent non-LIPS consultant when preference is enabled.
- [ ] LIPS preference never overrides a superior clinical/sub-specialty fit.
- [ ] Multi-specialty doctors remain eligible on verified secondary specialties.
- [ ] `Why this doctor` evidence corresponds to public profile/taxonomy data.

## Voice

- [ ] On Vercel HTTPS in current Chrome/Edge, Dictate requests microphone permission.
- [ ] Interim/final transcript appears in the same note field.
- [ ] Stop leaves the transcript editable before search.
- [ ] Blocking microphone permission produces a clear fallback message.
- [ ] Unsupported browser leaves typing fully functional.
- [ ] Staff are instructed to review dictation, especially negative words such as `no` / `denies`.

## Safety / governance

- [ ] Severe configured red-flag example hides routine consultant cards.
- [ ] Negated urgent phrases do not trigger an emergency flag.
- [ ] Red-flag rule content has written clinical-governance approval before staff use.
- [ ] Low-confidence cases can be manually reviewed instead of forcing a doctor.
- [ ] No patient identifiers are requested or written to application logs.
