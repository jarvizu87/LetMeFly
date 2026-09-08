# Program Source Coverage

This document records what is actually encoded in the current LetMeFly build versus what remains a governed external source awaiting structured import.

## Governing releases

- Crownforge: **Crownforge Revised Integrated v2.1**. The governed release is 14 weeks plus a mandatory, separate 3-week Crown Maintenance bridge. Percentage/TM and exact programmed loads remain the loading authority; RPE is an effort/quality ceiling unless the program explicitly says otherwise.
- Black Crown: **Black Crown Revised v2.0**, 54-week governed strength and athletic-development program.

## Current app coverage

### Crownforge — STRUCTURED

The current modular program-data overlay contains:

- `src/programs/crownforge/` — Weeks 1–14 and Crownforge governance.
- `src/programs/crown-maintenance/` — the separate 3-week mandatory bridge.
- `src/programs/registry.ts` — cross-program lookup only; no prescriptions.
- `src/data/programs.ts` — compatibility facade only; no prescriptions.

Current Crownforge audits protect, among other things:

- 14 weeks / 98 calendar days.
- Crown Maintenance as a separate 3-week / 15-session bridge.
- Week 10 Day 6 exactly one `160 lb x 2-3` bench exposure.
- Week 12 as the true deload.
- Weeks 13–14 governed testing rather than invented maxes.
- Maintenance percentage work resolving from verified post-test references.
- Black Crown entry gate behavior remaining separate from Crownforge prescriptions.
- Programmed exercise display names resolving through the Exercise Intelligence Library.

The approved Drive Crownforge v2.1 source remains the human-readable reference used for intentional corrections and audits.

### Black Crown — CATALOG-ONLY PENDING DETAILED IMPORT

- `src/programs/black-crown/` exists as an independent modular package.
- Program identity and transition/entry governance can be registered.
- The detailed 54-week prescription dataset is **not yet claimed as structured app coverage**.
- The current approved Black Crown v2.0 human-readable source must be intentionally imported and audited before the app may claim full Black Crown coverage.
- Do not derive Black Crown weeks from Crownforge or from older historical Black Crown documents.

## Exercise Intelligence — STRUCTURED NON-PRESCRIPTION LAYER

Exercise Intelligence is now maintained as a separate public-shell overlay under
`overlays/exercise-intelligence/`. It is intentionally descriptive and does not
own program prescriptions.

Current audited coverage:

- **92 / 92** current app exercise identities.
- **92 / 92** movement-role and training-purpose records.
- **92 / 92** primary/secondary muscle records.
- **92 / 92** coaching-cue and common-mistake records.
- **25** governed substitution rules.
- **23** substitution rules whose alternative already exists as a canonical current-app exercise.
- **2** explicit default-prohibited relationships preserved as blocked rather than treated as equivalents.
- **11** direct-demo candidates retained as review-only until URL validation is intentional and complete.

The canonical payload is hash-verified from four transport chunks before a build
may materialize it. The runtime copy is privacy-audited so private Drive file IDs
or URLs cannot be exposed through the public exercise-intelligence JSON.

The production installer exposes the data through a read-only browser lookup API.
The Exercises page `INFO` action may use that API to explain purpose, roles,
equipment, muscles, cues, mistakes, and the current Watch Exercise link. If the
intelligence layer is unavailable, the existing INFO behavior remains the fallback.

The new INFO integration does **not** override the existing `SUBSTITUTE` action.
A broader substitution UI must remain gated by role preservation, use condition,
loading adjustment, and the governing program's phase/prescription rules.

A program may reference an exercise only when its display name resolves through
the governed exercise library or through an intentional canonical alias.
Substitutions must preserve training role, movement purpose, stimulus, and phase
requirements rather than merely matching a muscle group.

## Safety / source-gap rule

If a prescription cannot be traced to the governing source, LetMeFly must preserve the source gap rather than invent exercises, sets, reps, percentages, loads, distances, progression, testing outcomes, or readiness modifications for variety.

Historical rebuild documentation may describe earlier partial coverage. Where that conflicts with the current audited modular program-data overlay, the current audited overlay and approved program source govern.
