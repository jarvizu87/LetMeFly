# Black Crown v2.0 Import Status

Canonical source: `LetMeFly Private Exercise Thumbnails - JP/Black Crown/BLACK_CROWN_REVISED_54_WEEK_PROGRAM_v2_0_APPROVED_WAVE_CIRCUIT_STYLE_SPACED.docx`

Working branch: `black-crown-v2-0-modular-import`

Latest source-stage validation: GitHub Actions `Black Crown v2 Source Audit` run 17 (`34171539409`) — **PASS**.

## Batch checkpoints

Source staging is complete for all nine blocks. `SOURCE-STAGED` means the canonical public source prescriptions are safely committed and hash-audited, but have not yet all been normalized into final engine-native exercise/set objects.

| Batch | Weeks | Source extraction | Source staging | Source audit | Runtime normalization |
|---|---:|---|---|---|---|
| 1 | 1-6 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 2 | 7-12 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 3 | 13-18 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 4 | 19-24 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 5 | 25-30 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 6 | 31-36 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 7 | 37-42 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 8 | 43-48 | COMPLETE | SOURCE-STAGED | PASS | PENDING |
| 9 | 49-54 | COMPLETE | SOURCE-STAGED | PASS | PENDING |

## Source-stage gates — PASSED

- [x] 54 canonical source weeks staged.
- [x] 270 sessions present — exactly five sessions per week.
- [x] Source-parity hashes pass all 54 weeks.
- [x] Test/check schedule matches v2.0.
- [x] Strict OHP source exposure count = 42 and protected removal weeks are clear.
- [x] Mandatory / Conditional / Optional priorities preserved in source staging.
- [x] No athlete calendar dates exposed in the public Black Crown source package.
- [x] No athlete-derived exact pound loads exposed where percentage/TM loading is authoritative.
- [x] Day 4 recovery/structural source rule preserved outside governed test/opener weeks.
- [x] Crownforge regression passes unchanged.
- [x] Crown Maintenance regression passes unchanged.
- [x] TypeScript passes with the source overlay applied.
- [x] Vite production build passes with the source overlay applied.
- [x] Registry/facade remain prescription-free at the source-staging checkpoint.

Source-stage aggregate digest: `843a4afc2736201b132f75e1945ee08a371c2bda583f672f5dd1f68dfdd65c48`.

## Runtime integration gates — NEXT

- [ ] Normalize all 54 weeks into engine-native `ProgramWeek` / `ProgramDay` / `WorkoutSection` / `ProgramExercise` / `ProgramSet` data.
- [ ] Preserve percentages, set/rep structures, RPE/effort ceilings, rest, order, priority, and governed load references during normalization.
- [ ] Preserve TM rounding: selected TM nearest 5 lb; percentage work rounds up to nearest 5 lb.
- [ ] Resolve every programmed exercise display name through the Exercise Intelligence Library.
- [ ] Validate barbell-loading compatibility for percentage/TM exercises.
- [ ] Update Black Crown metadata to the canonical nine 6-week blocks.
- [ ] Change Black Crown from `catalog-only` to active source only after runtime normalization passes.
- [ ] Register Black Crown v2.0 as reachable through central program lookup without adding prescriptions to the registry/facade.
- [ ] Apply the Black Crown overlay in the production build after Crownforge and before UI overlays.
- [ ] Run final Black Crown + Crownforge + Crown Maintenance + exercise-library + TypeScript + production-build regression.

This file is intentionally updated at durable checkpoints so a timeout or chat change cannot lose import position.
