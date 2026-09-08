# Apply runtime-v2 effective-prescription delta

Base expected: the V5.4 progression Shadow runtime-v1 candidate represented by PR #23 before this runtime-v2 commit.

This delta adds explicit `coachingDecisions` -> `effectivePrescribedUnits` support without enabling visible progression UI.

To reconstruct the patch from this overlay:

```bash
cat patch/runtime-v1-to-v2.patch.gz.b64.* > /tmp/runtime-v2.patch.gz.b64
base64 -d /tmp/runtime-v2.patch.gz.b64 > /tmp/runtime-v2.patch.gz
gzip -dc /tmp/runtime-v2.patch.gz > /tmp/runtime-v1-to-v2.patch
```

Review the patch before applying it. The active UI/runtime branch should consume it only through the controlled Shadow integration lane.

Primary changes:
- add `src/services/coaching-decision-service.ts`
- update `src/progression/lmf-shadow-adapter.ts`
- add reproducible `npm run audit:progression-shadow`
- update Shadow integration docs/validation log
- no visible XP/Quest UI
- no Crownforge/Black Crown programming changes
