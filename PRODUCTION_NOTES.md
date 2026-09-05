# Production Notes — v4

## Purpose

v4 removes booking concerns from the product scope. Its purpose is to reduce contact-centre search time while keeping clinical fit ahead of commercial preference.

## Critical correctness controls

### 1. Negation-aware routing

The parser identifies common English denial/absence structures before scoring symptoms or doctor profiles. Negated concepts do not contribute to specialty scores, sub-specialty selection, profile evidence, or urgent flags.

Supported patterns include `no`, `denies`, `without`, `negative for`, `free of`, `absence of`, `does not have/report/experience`, and common variants. Contrast/reset handling supports phrases such as `denies chest pain but reports reflux` and `no chest pain and experiencing palpitations`.

Exceptions prevent common false negation, including `no improvement in chest pain` and `not only chest pain`. Scope handling also distinguishes terse notes such as `no chest pain with palpitations` from contextual denial such as `no pain with urination`.

### 2. Clinical tier before LIPS clinic priority

Location preference is not a global score bonus. Ranking order is:

- exact sub-specialty;
- related sub-specialty / strong profile evidence;
- specialty-only;
- then LIPS Healthcare clinic preference within the same tier;
- then profile evidence and stable alphabetical fallback.

Runtime rollback: set `PREFER_LIPS_HEALTHCARE=false`.

### 3. Clinician Locations only

The site footer contains a global `Our Location` section for LIPS Healthcare. v4 never uses that footer to mark a doctor as consulting at LIPS. Only the clinician's `Locations` section is parsed.

A failed/empty location parse is treated as **unverified**, not `false`. Previous verified location data is preserved.

### 4. Taxonomy contamination fixes

The profile header stops before biography/locations/availability sections, preventing addresses and clinic names from being stored as sub-specialties. Keyword extraction uses word boundaries, preventing substring errors such as `ENT` inside `Preventive`.

### 7. Partial-crawl protection

The live crawl must meet record and specialty minimums. Once a healthy directory exists, it must also retain at least the configured fraction of the previous directory (default 85%). If the gate fails, the previous dataset is preserved.


### 5. Multi-specialty profiles

A clinician can be listed under more than one top-level LIPS specialty. v4 stores `specialty` (primary) and `specialties[]` (all verified profile labels). Routing and doctor eligibility use the full list, preventing a dual-listed clinician from disappearing when the requested specialty is their secondary listing.

Current examples such as Diabetes + Endocrinology are therefore handled without collapsing both services into one label.

### 6. Production readiness enforcement

When `REQUIRE_READY_DIRECTORY=true` (the production default), `/api/analyze` returns `503 DIRECTORY_NOT_READY` until the directory meets the configured specialist/specialty minimums and the last update passed the coverage gate. The bootstrap cache can be used for development but cannot silently become the live contact-centre dataset.

## Operational checks

A deployment should not be considered ready for contact-centre use until:

- `/ready` returns 200;
- the directory count is credible for the current LIPS site;
- specialty count meets the configured minimum;
- location extraction has a sensible verified count;
- LIPS Healthcare clinic count is plausible after spot-checking several profiles;
- regression tests pass;
- a clinician or service lead has reviewed representative routing examples.

## Known boundary

The rules are designed for routing, not diagnosis. Free-text medicine is inherently ambiguous. Low-information or conflicting descriptions deliberately return a low-confidence/uncertain result instead of forcing a specialty.


## 8. Optimized directory updater

v4 keeps the same coverage gate but reduces update time by:

- using sitemaps first and skipping a full specialty-page crawl when sitemap coverage is already healthy;
- reducing repeated deep DOM scans during discovery;
- blocking images, media, fonts and common third-party trackers in the crawler;
- processing profile pages with a bounded worker pool (`SCRAPE_CONCURRENCY`, default 3);
- avoiding `networkidle` waits on each clinician profile;
- retrying only failed profile URLs once at lower concurrency.

The admin status endpoint exposes in-memory progress only; it never stores patient text. A process restart can reset the progress display, but the persistent specialist dataset remains protected by atomic writes and the coverage gate.

For Render Starter / 512 MB, keep concurrency at 3. On larger instances it can be raised carefully, but values above 6 are intentionally rejected by the application.


## 9. Failed refresh does not take the contact centre offline

A rejected partial crawl preserves both the previous specialist dataset and its last successful `lastUpdated` timestamp. `/ready` remains healthy when that preserved dataset already meets production coverage. The admin UI still reports the failed/preserved refresh attempt so it can be investigated without blocking staff from using the last verified directory.
