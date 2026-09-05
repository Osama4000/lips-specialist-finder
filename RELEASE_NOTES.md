# Release Notes — v4.0.0 Fast Production Updater

## Scope
English-only contact-centre routing from free-text symptoms to LIPS specialty, sub-specialty and ranked specialists. Booking remains intentionally out of scope.

## Update-performance changes
- Sitemap-first discovery with a fast path when sitemap coverage is healthy.
- Directory discovery stops after fewer stable rounds instead of repeatedly crawling unchanged content.
- Heavy assets (images, media, fonts) and common third-party trackers are blocked in the crawler.
- Specialist profiles are processed through a bounded concurrent worker pool (default 3).
- Per-profile `networkidle` waits and artificial sequential delays were removed.
- Failed profiles are retried once at lower concurrency; successful profiles are not repeated.
- Admin UI now reports live stage, progress percentage, processed/total, successes, current failures and retry progress.

## Correctness retained from v3
- Negation-aware routing and profile evidence (`no chest pain`, `denies palpitations`, etc.).
- Multi-specialty clinician indexing.
- Clinician Locations-only LIPS Healthcare detection.
- Clinical fit always outranks LIPS Healthcare business preference.
- Partial-crawl coverage gate and production readiness enforcement.
- A failed refresh no longer takes a previously healthy directory offline; the last verified dataset remains routable while the admin is warned.
- No patient symptom text in application logs.

## Verification
- `npm run check`: PASS
- `npm test`: 57/57 PASS
- Worker-pool concurrency/failure isolation regression tests: PASS

The included specialist JSON remains a bootstrap cache. Production use requires a successful live update and `/ready` HTTP 200.

## v4.0.1 Render deployment fix
- Render deployment now uses the official Playwright Docker image so Chromium and Linux browser dependencies are preinstalled.
- Removed `playwright install --with-deps` from Render's native Node build, which requires privileged OS package installation and fails with `su: Authentication failure`.
