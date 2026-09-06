# Replace the Current Vercel Demo with v6

The current architecture is:

```text
GitHub repository
   ├─ application code → Vercel auto deploy
   └─ GitHub Action → crawl LIPS → commit refreshed data → Vercel auto deploy
```

## Safest replacement sequence

1. Download and extract the v6 ZIP.
2. Replace the application files in the GitHub repository with the v6 files.
3. **Do not upload `.env` or `node_modules/`.** Keep `.env.example`.
4. Make sure this hidden workflow still exists in GitHub:

   `.github/workflows/update-lips-directory.yml`

   If GitHub's browser uploader hides `.github`, create the file with **Add file → Create new file** and type the full path above.
5. Commit the v6 files to `main`.
6. Vercel should auto-deploy that commit. It is normal for readiness to be false if the replacement temporarily contains the bootstrap directory.
7. In GitHub open **Actions → Update LIPS specialist directory → Run workflow**.
8. Wait for the run to turn green. It normally takes much longer than a normal website deployment because it visits LIPS profiles with Playwright.
9. The action should create a bot commit similar to `chore: refresh LIPS specialist directory` when data changed.
10. Vercel auto-deploys that new data commit.
11. Open:

   `/health`

   and then:

   `/ready`

   The final `/ready` response should contain `"ready": true` and credible specialist/specialty counts.

## Vercel environment variables

Keep your secret in Vercel, not GitHub:

```text
ADMIN_PASSWORD=<your strong password>
REQUIRE_READY_DIRECTORY=true
PREFER_LIPS_HEALTHCARE=true
SERVER_SCRAPER_ENABLED=false
AUTO_UPDATE_ON_START=false

# Optional — only required for full cross-browser voice fallback
OPENAI_API_KEY=<server-side secret>
VOICE_TRANSCRIPTION_ENABLED=true
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

The last four also have safe code defaults for this architecture, but explicitly setting them makes the deployment intention clear.

## First smoke tests after deployment

Use the main page and verify:

- `No chest pain.` → no forced Cardiology route.
- `No chest pain with recurrent palpitations.` → Cardiology / Arrhythmia evidence from palpitations.
- `History of chest pain last year but currently acid reflux.` → current reflux drives Gastroenterology.
- `Mother had breast cancer. Patient has knee pain and swelling.` → family context is ignored for patient routing; Orthopaedics/Knee drives the route.
- `Lower back pain shooting down the right leg with tingling.` → spine/radicular pathway.
- `Back pain has resolved. Current shoulder pain.` → shoulder drives current routing.
- `Possible thyroid problem.` → uncertainty is shown.
- Microphone: test native recognition where available. For Firefox / browsers without usable native recognition, add `OPENAI_API_KEY` in Vercel and verify the recorder fallback transcribes after Stop. On iPhone, test Safari over HTTPS and confirm either native recognition or the configured recorder fallback works.

## If Vercel shows an old UI after deployment

v6 adds cache-busting query versions to the main JS/CSS references. A normal refresh should be enough. If needed, hard-refresh once (`Ctrl+F5` / `Cmd+Shift+R`).
