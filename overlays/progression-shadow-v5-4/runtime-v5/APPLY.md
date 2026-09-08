# Apply Runtime v5

Base candidate: LetMeFly V5.4 Progression Shadow Runtime v4.

Reconstruct the delta patch by concatenating the files in `patch/` in lexical order, base64-decoding, then gunzipping.

The v5 patch changes only the isolated Shadow candidate and adds pilot evidence/preflight tooling. It does not alter Crownforge/Black Crown program data or enable visible progression UI.

After applying, run:

- `node scripts/audit-rebuild.mjs`
- `node scripts/audit-crownforge-week1.mjs`
- `node scripts/audit-crownforge-week2.mjs`
- `node scripts/audit-crownforge-weeks3-6.mjs`
- `node scripts/audit-crownforge-weeks1-6-regression.mjs`
- `node scripts/audit-exercise-library.mjs`
- `node scripts/audit-progression-shadow-v54.mjs`

The progression audit performs a strict TypeScript compile using the same narrow temporary Supabase declaration used by the V5.4 source audit.
