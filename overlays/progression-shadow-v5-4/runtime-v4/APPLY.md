# Apply runtime-v4 pilot-gate delta

Base expected: runtime-v3 on PR #23.

```bash
cat patch/runtime-v3-to-v4.patch.gz.b64.* > /tmp/runtime-v4.patch.gz.b64
base64 -d /tmp/runtime-v4.patch.gz.b64 > /tmp/runtime-v4.patch.gz
gzip -dc /tmp/runtime-v4.patch.gz > /tmp/runtime-v3-to-v4.patch
cd <runtime-v3-source-root>
git apply --check /tmp/runtime-v3-to-v4.patch
git apply /tmp/runtime-v3-to-v4.patch
```

Then run the existing progression/source/Crownforge/exercise audits. Visible progression remains disabled.
