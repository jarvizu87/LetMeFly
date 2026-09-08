# Apply the V5.4 Progression Shadow Runtime Patch

Baseline required:

- `LETMEFLY_REBUILT_SOURCE_V5_4.zip`
- SHA-256 `48aa4bde71f768d77aa8ba916d53c29c756d31896d6386a2c3cf23831d2492a7`

The patch is stored as `runtime-patch.gz`.

Apply only in a dedicated integration workspace/branch. Do not apply directly to the active UI branch while it is changing.

Example after extracting the canonical V5.4 source:

```bash
gzip -dc runtime-patch.gz > progression-shadow-v54.patch
cd letmefly_app
git apply --check progression-shadow-v54.patch
git apply progression-shadow-v54.patch
```

Then run the existing V5.4 audits plus strict TypeScript checking in a normal dependency-installed environment.

This patch:

- vendors the progression engine under `src/progression-engine/`;
- adds the V5.4 adapter under `src/progression/`;
- hooks progression after canonical workout completion;
- adds fail-open startup replay;
- uses private IndexedDB Shadow persistence;
- does not expose XP/Quest UI;
- does not change Crownforge or Black Crown programming.
