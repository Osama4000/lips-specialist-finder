# Go-Live QA Checklist

## Automated

- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] `/health` returns 200.
- [ ] `/ready` returns 200 after a live directory update.

## Updater

- [ ] Admin progress moves through discovery → profiles → retry (if needed) → validating → completed/preserved.
- [ ] `Processed` reaches `total` without the server becoming unresponsive.
- [ ] A failed profile does not abort other profile workers.
- [ ] A deliberately incomplete crawl preserves the previous healthy dataset.

## Directory

- [ ] Specialist count is credible against the current LIPS directory.
- [ ] Specialty count is credible.
- [ ] Coverage gate is `PASSED`.
- [ ] Randomly open 10 profiles and compare specialty/sub-specialty with stored data.
- [ ] Randomly open 10 profiles and compare `worksAtLipsHealthcare` with the clinician `Locations` section.
- [ ] Confirm a profile whose footer shows LIPS but whose clinician locations do not include LIPS is stored as `worksAtLipsHealthcare=false` or unverified.

## Routing smoke tests

- [ ] `No chest pain.` does not route to Cardiology.
- [ ] `No chest pain. Persistent knee pain and swelling.` routes to Trauma & Orthopaedics → Knee.
- [ ] `Denies chest pain and reports palpitations.` routes to Cardiology / Arrhythmia.
- [ ] `Denies chest pain, palpitations and shortness of breath, but reports acid reflux.` routes to Gastroenterology.
- [ ] `No improvement in chest pain.` still recognises chest pain as present.
- [ ] `No chest pain with palpitations.` ignores chest pain and still routes palpitations to Cardiology.
- [ ] `No pain with urination.` does not force Urology.
- [ ] `Type 2 diabetes with poor blood sugar control.` routes to Diabetes.
- [ ] `Thyroid nodule with hyperthyroidism.` routes to Endocrinology.
- [ ] `Older adult with frailty and recurrent falls.` routes to Geriatrics.
- [ ] A dual-listed Diabetes + Endocrinology consultant can appear on an Endocrinology route.
- [ ] `Severe chest pain and difficulty breathing.` triggers the urgent guardrail.
- [ ] Exact non-LIPS sub-specialist ranks above a general LIPS-clinic doctor.
- [ ] Clinically equivalent LIPS-clinic doctor ranks above an equivalent non-LIPS doctor.

## Contact-centre UX

- [ ] Top specialty and sub-specialty are visible without scrolling on normal desktop resolution.
- [ ] Negated symptoms are shown as ignored.
- [ ] LIPS Healthcare clinic badge appears only on verified profiles.
- [ ] Opening a profile always goes to `https://lips.org.uk/...`.
- [ ] No patient-identifying data is requested by the UI.
