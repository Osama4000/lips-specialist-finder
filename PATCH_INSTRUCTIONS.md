# v6.2 Smart Routing Patch — Apply over v6.1

Replace only the files included in this patch. Do **not** delete or replace your current live doctor data.

Keep these existing live files unchanged:
- `data/specialists.json`
- `data/metadata.json`
- `.env`

Changed files in this patch:
- `package.json`
- `services/clinicalKnowledge.js`
- `services/router.js`
- `clinical-knowledge/symptoms.json`
- `public/app.js`
- `public/index.html`
- `public/style.css`
- `tests/router.test.js`
- `RELEASE_NOTES_V6_2.md`

After committing the replacements to `main`, Vercel can auto-deploy. No doctor-directory refresh is required just for this patch.

Optional local QA:
```bash
npm test
npm run check
```

Expected result for this build: `99/99` tests passing.
