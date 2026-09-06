# Crownforge Week 2 Source Audit

Audit status: **PASS**

Source authority:
- `CROWNFORGE_REVISED_INTEGRATED_v2_1.docx`
- v2.1 source engine: `v1.7.20`
- Build: August 29, 2026

Week 2 calendar: September 14–20, 2026.
Intent: **Accumulate the highest clean volume of the opening wave.**

## Verified blocks

- Day 1: Front Squat / Bench ramp and all primary support loads verified.
- Day 2: Hang Power Clean `95x3 → 100x3 → 105x3x4`; Clean Pull `140x3 → 150x2 → 155x2x2`; Push Press `70x5 → 75x5 → 80x3`; upper support retained.
- Day 3: recovery minimum, sled/knee work, and restorative-only optional work verified.
- Day 4: Deadlift `160x5 → 175x4 → 185x3 → 195x2`; pull/row/hamstring/sled/yoke/trunk work verified. Week 1's one-set shrug exception does not leak into Week 2.
- Day 5: Green/Yellow/Red FLEX rule and exact KB/sled/engine prescriptions verified.
- Day 6: Bench `95x5 → 120x4 → 135x3x2 → 145x3x4 → 135x4x2`; full-body/chest/frontal-plane source verified; separate sled finisher default-omitted after a full Day 5.
- Day 7: governed rest / no make-up punishment verified.

## Code audit

PASS:
- exactly 7 Week 2 calendar days
- all Week 2 dates correct
- exact key prescriptions present
- Week 1 regression audit still passes
- strict TypeScript check of `src/data/programs.ts` passes
- source/static rebuild audit passes
- `CROWNFORGE.weekData` now contains Weeks 1–2

## Source archive checkpoint

- Archive: `LETMEFLY_REBUILT_SOURCE_V5_2.zip`
- Google Drive file ID: `1JqvjI6vhHRLWlEhN136EdA2Nffrl9Gju`
- SHA-256: `24ff93eb5f1fbd83148325b6de4b13030175e44f2e9d6381d7b113b976af9c91`
- Package version: `5.2.0-rebuild.1`

## Open items

Weeks 3–14, Crown Maintenance Weeks 1–3, and Black Crown detailed sessions remain intentionally unimported until their governing source is recovered and audited. The real networked Vite production build and Netlify production deploy also remain open.
