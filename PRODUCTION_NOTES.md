# Production Notes — v6

## Scope

The service is a contact-centre **directory-routing assistant**. It does not diagnose, book or replace clinician judgement.

## 1. Hybrid knowledge model

Routing combines three controlled sources:

1. curated routing rules for high-value specialty/sub-specialty patterns;
2. the v6 common-language symptom ontology;
3. current structured/public terms extracted from live LIPS consultant profiles.

The external vocabulary improves language coverage but cannot create an eligible consultant. The final doctor list is still constrained by the current LIPS directory.

## 2. Context states

Clinical phrases are classified before scoring. Present terms contribute fully, uncertain terms contribute less, historical terms contribute only minimally to candidate context, and denied/family/resolved terms do not drive current routing.

The parser includes regression coverage for difficult short-note constructions such as `no chest pain with palpitations`, `no pain with urination`, `no improvement in chest pain`, family-history phrases and current-symptom resets.

## 3. Doctor-level precision

Ranking is not a global bag-of-words score. It applies clinical tiers and anatomical mismatch checks before the LIPS Healthcare preference. A doctor with the correct narrow sub-specialty remains above a LIPS-clinic generalist who is less clinically specific.

Multi-specialty profiles remain eligible through any verified top-level specialty.

## 4. Live LIPS evidence

The crawler stores public profile taxonomy, conditions, expertise, role/biography and clinician locations. The clinician `Locations` section is parsed separately from the global site footer so `worksAtLipsHealthcare` cannot be inferred from the footer alone.

v6 additionally maps common ontology concepts found in profile text into structured evidence to improve downstream doctor matching.

## 5. Uncertainty and clarification

The engine is allowed to say that evidence is insufficient. It can present one targeted clarification when an ontology concept has an approved question and the route is genuinely ambiguous. It should not turn the tool into a long symptom questionnaire.

## 6. Urgent guardrails

Emergency rules are conservative UI guardrails. When one triggers, routine consultant results are hidden and the user is directed to the organisation's approved escalation protocol.

Clinical governance must review the wording, supported patterns and organisational action before operational rollout. Do not treat the included rules as an independently validated triage protocol.

## 7. Voice

Voice remains optional input convenience only. v6.1 first uses native browser speech recognition and can fall back to `MediaRecorder` plus server-side speech-to-text when `OPENAI_API_KEY` is configured. This is the path for Firefox and other browsers without usable native `SpeechRecognition`, and it also provides a fallback when a Chromium/Safari implementation is blocked or unavailable.

The app does not persist audio to disk. The server forwards a short in-memory recording to the configured provider and returns text. For real patient calls, complete privacy / DPA / information-governance review before enabling the provider. Staff must review every transcript, especially negations and medication/condition names.

## 8. Privacy

The interface tells staff not to enter direct patient identifiers. Application HTTP logs record request metadata only, not the symptom note. Analyse responses have `Cache-Control: no-store`.

## 9. Directory refresh / demo hosting

On Vercel/low-memory hosts, server-side Playwright is disabled. GitHub Actions performs crawling and commits only a dataset that passes record/specialty/retention coverage gates. This avoids tying call-centre availability to a long-running browser job.

## 10. Go-live evidence

Before operational use, maintain a clinician-reviewed benchmark set of real-world anonymised call-note examples and measure at least top-1 specialty accuracy, top-3 consultant suitability, wrong-specialty rate, low-confidence rate and override rate. Code regression tests protect known behaviour but are not a substitute for clinical validation on representative cases.
