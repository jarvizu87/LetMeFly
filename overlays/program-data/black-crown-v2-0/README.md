# Black Crown Revised v2.0 Program-Data Overlay

This overlay imports the canonical Black Crown Revised v2.0 program into LetMeFly using the same modular program-package architecture established for Crownforge.

## Canonical source

- Drive folder: `LetMeFly Private Exercise Thumbnails - JP/Black Crown/`
- Source file: `BLACK_CROWN_REVISED_54_WEEK_PROGRAM_v2_0_APPROVED_WAVE_CIRCUIT_STYLE_SPACED.docx`
- Source file ID: `1AUuZFRwh61AkyVpWGXtNO6OJkxuqmKwC`
- Release identity: `BLACK CROWN REVISED - 54-WEEK STRENGTH / POWERBUILDING / REALIZATION PROGRAM - PRODUCTION RELEASE v2.0`
- Athlete-facing source states that it is built from the Stage-5A production workbook and preserves the approved Stage-4 architecture.

## Import architecture

- `src/program-engine/` remains reusable program types/builders only.
- `src/programs/crownforge/` remains untouched.
- `src/programs/crown-maintenance/` remains untouched.
- `src/programs/black-crown/` will own Black Crown Revised v2.0 Weeks 1-54 plus Black Crown-specific governance.
- `src/programs/registry.ts` remains cross-program lookup only and must not contain workout prescriptions.
- `src/data/programs.ts` remains a compatibility facade only and must not contain workout prescriptions.

## Smart batch import plan

Black Crown is imported and validated in nine independent 6-week batches so no single generation or commit has to carry the entire 54-week program.

1. Block 1 - Weeks 1-6
2. Block 2 - Weeks 7-12
3. Block 3 - Weeks 13-18
4. Block 4 - Weeks 19-24
5. Block 5 - Weeks 25-30
6. Block 6 - Weeks 31-36
7. Block 7 - Weeks 37-42
8. Block 8 - Weeks 43-48
9. Block 9 - Weeks 49-54

Each batch is source-extracted, encoded, audited, and committed before the next batch begins. Program-wide registry/build integration happens only after all nine batches pass local source-parity checks.

## Source-level governance already confirmed

- 54 weeks total.
- Nine 6-week blocks.
- Five sessions per week.
- Primary loading is percentage / Training-Max governed.
- Normal Block-1 entry uses 90% of verified Crownforge 1RM, lift by lift.
- Protective Yellow entry uses 87.5% for that lift only.
- Red readiness delays active entry loading.
- Selected TMs round to nearest 5 lb; percentage work rounds up to nearest 5 lb.
- Mandatory / Conditional / Optional priorities are preserved.
- Session cut order is preserved.
- Strict OHP occurs by replacement, never as an added training day.
- Day 4 remains recovery / structural work.
- Power / Olympic work remains quality work, not conditioning.
- Test/check schedule: W12 verified test; W18 non-max check; W24 verified test; W30 non-max check; W36 verified test; W42 non-max check; W48 opener/readiness rehearsal with no TM change; W54 verified exit test.

## Protected invariants

- Crownforge prescriptions must not change during this import.
- Crown Maintenance prescriptions must not change during this import.
- Black Crown prescriptions are never silently rewritten for variety.
- Exercise display names must resolve through the Exercise Intelligence Library.
- Test/check weeks, OHP exclusions, readiness priorities, and percentage/TM loading authority must match the canonical v2.0 source.
