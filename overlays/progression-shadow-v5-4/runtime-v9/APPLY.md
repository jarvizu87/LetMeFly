# Apply Runtime v9 Overlay

Base candidate: LetMeFly V5.4 Progression Shadow Runtime v8.

```bash
cat patch/runtime-v8-to-v9.patch.gz.b64.* | base64 -d > runtime-v8-to-v9.patch.gz
gzip -dc runtime-v8-to-v9.patch.gz > runtime-v8-to-v9.patch
patch -p1 < runtime-v8-to-v9.patch
```

Then run the progression, source/security, Crownforge Weeks 1–6 regression, and Exercise Intelligence audits.

Runtime v9 remains a Shadow-only integration candidate. Do not use synthetic audit success as a substitute for the required real three-workout pilot evidence.
