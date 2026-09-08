# Apply Runtime v10 Overlay

Base candidate: LetMeFly V5.4 Progression Shadow Runtime v9.

```bash
cat patch/runtime-v9-to-v10.patch.gz.b64.* | base64 -d > runtime-v9-to-v10.patch.gz
gzip -dc runtime-v9-to-v10.patch.gz > runtime-v9-to-v10.patch
patch -p1 < runtime-v9-to-v10.patch
```

Then run:

```bash
node scripts/audit-progression-shadow-v54.mjs
node scripts/audit-rebuild.mjs
node scripts/audit-crownforge-weeks1-6-regression.mjs
node scripts/audit-exercise-library.mjs
```

Runtime v10 remains Shadow-only. A human-review disposition excludes a workout from the pilot sample; it never edits evidence and never turns a technical failure into a pass.
