# v5.0 Free Demo / Low-Memory Release

- Render runtime returned to native Node; no Chromium is installed in the web service.
- Render plan defaults to `free` and no persistent disk is required.
- Server-side crawling is disabled by default to prevent 512 MB OOM crashes.
- Added GitHub Actions crawler job with Playwright, tests, coverage-gate verification, and automatic data commit.
- Playwright moved to development dependencies so the Render web build can omit it.
- Admin UI shows whether refresh is handled by the server or externally.
- Data initialization no longer crashes when a packaged seed file is absent.
- Existing routing, negation handling, specialty/sub-specialty logic, LIPS-location preference, and coverage gate remain intact.
