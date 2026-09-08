# Apply Runtime v8 Overlay

Base candidate: LetMeFly V5.4 Progression Shadow Runtime v7.

Reconstruct the patch from the files under `patch/` in lexical order:

```bash
cat patch/runtime-v7-to-v8.patch.gz.b64.* | base64 -d > runtime-v7-to-v8.patch.gz
gzip -dc runtime-v7-to-v8.patch.gz > runtime-v7-to-v8.patch
patch -p1 < runtime-v7-to-v8.patch
```

After applying, run:

```bash
node scripts/audit-progression-shadow-v54.mjs
node scripts/audit-rebuild.mjs
node scripts/audit-crownforge-week1.mjs
node scripts/audit-crownforge-week2.mjs
node scripts/audit-crownforge-weeks3-6.mjs
node scripts/audit-crownforge-weeks1-6-regression.mjs
node scripts/audit-exercise-library.mjs
```

The progression audit harness performs strict TypeScript compilation with the same narrow temporary Supabase declaration used by the V5.4 rebuild audit.

Do not merge into the active runtime/UI lane solely because this overlay passes synthetic checks. The visible pilot still requires genuine reviewed Shadow workouts.
