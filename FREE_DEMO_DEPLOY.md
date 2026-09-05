# Free / low-memory demo deployment

This build deliberately separates the heavy Playwright crawler from the Render web service.

## Why

Chromium can exceed a 512 MB Render instance during a full directory crawl. The routing API itself is lightweight and does not need Chromium.

## Architecture

- Render web service: Express routing API + static UI only.
- GitHub Actions: runs Playwright, refreshes `data/specialists.json` and `data/metadata.json`, validates the coverage gate, commits the files.
- Render Auto Deploy: deploys the committed directory snapshot.
- No Render persistent disk is required for the demo because the approved directory snapshot ships with the repository.

## First deployment

1. Push this version to GitHub.
2. Let Render sync the new `render.yaml` (Free Node web service, no disk, no browser install).
3. In GitHub open **Actions** -> **Update LIPS specialist directory** -> **Run workflow**.
4. Wait for the workflow to finish successfully. It will commit the refreshed directory to `main`.
5. Render auto-deploys that commit.
6. Confirm `/ready` returns HTTP 200 before relying on recommendations.

## Refreshing later

The workflow runs once a day and can also be triggered manually. If scheduled refreshes are not wanted during the demo, remove the `schedule:` block and keep `workflow_dispatch:` only.

## Local refresh

On a machine with Node 20+:

```bash
npm install
npx playwright install chromium
npm test
npm run update
```

Then commit `data/specialists.json` and `data/metadata.json`.
