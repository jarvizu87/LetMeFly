# Apply runtime-v3 pilot-guard delta

Base expected: the V5.4 progression Shadow runtime-v2 candidate on PR #23.

Reconstruct the patch:

```bash
cat patch/runtime-v2-to-v3.patch.gz.b64.* > /tmp/runtime-v3.patch.gz.b64
base64 -d /tmp/runtime-v3.patch.gz.b64 > /tmp/runtime-v3.patch.gz
gzip -dc /tmp/runtime-v3.patch.gz > /tmp/runtime-v2-to-v3.patch
```

Apply only in the isolated progression Shadow integration lane.

```bash
cd <runtime-v2-source-root>
git apply --check /tmp/runtime-v2-to-v3.patch
git apply /tmp/runtime-v2-to-v3.patch
```

Then run:

```bash
npm run audit:progression-shadow
npm run audit:source
npm run audit:crownforge
npm run audit:exercise-library
```

No visible progression UI is enabled by this delta.
