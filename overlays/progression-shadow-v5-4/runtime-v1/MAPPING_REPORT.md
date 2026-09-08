# LetMeFly V5.4 Progression Shadow Runtime Mapping Report

## Status

Actual V5.4 private workout schema mapping is implemented and validated in an isolated candidate. No visible XP/Quest UI is enabled.

## App schema mapped

- `workoutSessions.athlete_id` -> progression athleteId
- `workoutSessions.program_key` -> programId
- `workoutSessions.program_version` -> programVersion
- `workoutSessions.program_instance_id` -> programRunId
- `workoutSessions.id` -> workoutId
- `workoutExercises.id` -> stable prescription item ID
- `workoutExercises.exercise_key` -> source exercise ID
- completed `workoutSets` -> completed units
- `group_key` + canonical ProgramDay section -> circuit/group metadata
- readiness entry at/before completion -> Green / Yellow / Red gate

## Runtime behavior

The canonical LetMeFly workout is committed first. Progression runs afterward in SHADOW mode. Errors are fail-open and cannot roll back the workout.

Progression persistence uses a separate IndexedDB database: `letmefly.progression.shadow.v1`.

The integrated app variant contains no private `localStorage.setItem(...)` fallback. If IndexedDB is unavailable, progression uses ephemeral memory while canonical training data remains safe.

## Readiness behavior validated

### Green W1D1 full completion
- XP: **752**
- core XP: 672
- optional XP: 16
- group bonus: 30
- session bonus: 34
- compatibility: PASS

### Yellow W1D1 representative adjusted session
- XP: **359**
- optional XP: **0**
- inactive conditional items: 7
- incomplete effective work does not receive a full-session bonus
- compatibility: PASS

### Red W1D1 safety-stop representative
- XP: **48**
- only actually completed mandatory/warm-up work earns XP
- conditional/optional support XP: **0**
- group bonus: **0**
- session bonus: **0**
- compatibility: PASS

## Embedded Crownforge coverage

All 42 currently embedded Crownforge days (Weeks 1-6) were mapped in a full Green completion audit.

- mapping compatibility: **42/42 PASS**
- mapping errors: **0**
- mapping warnings: **0**
- six-week full-Green workout XP potential: **24,563**
- minimum day XP: 14
- maximum day XP: 1222

Weekly full-Green totals:
- Week 1: 4,201 XP
- Week 2: 4,211 XP
- Week 3: 4,196 XP
- Week 4: 4,220 XP
- Week 5: 4,215 XP
- Week 6: 3,520 XP

Week 6 is lower (3,520 XP), which is directionally correct for the governed deload.

## Warm-up correction

The first actual-schema mapping audit exposed an inflation risk: Olympic Prep contains several technical drills and would have been rewarded as multiple full Olympic-power exercises. The mapper now collapses warm-up/primer/Olympic Prep sections into one capped `WARMUP_BLOCK`.

That reduced the six-week full-Green mapping total while preserving XP for actual primary/power work.

## Idempotency

W1D1 Green was processed twice through the progression engine:

- first award: **752 XP**
- replay award: **0 XP**
- immutable XP events: 14
- ledger lifetime XP: 752
- Main Quest status: COMPLETE

Result: PASS.

## Existing V5.4 audits after integration

- source/security audit: PASS
- Crownforge Week 1 audit: PASS
- Crownforge Week 2 audit: PASS
- Crownforge Weeks 3-6 audits: PASS
- Crownforge Weeks 1-6 calendar regression: PASS
- Exercise Intelligence audit: PASS
- strict TypeScript audit using the same temporary narrow Supabase declaration technique as the V5.4 source audit: PASS

## Known limitation before visible pilot

V5.4 currently does not persist an explicit per-exercise effective prescription for every Yellow Coach adjustment. The mapper therefore behaves conservatively: it can under-award a session-completion bonus when a reduced target was legitimate, but it will not invent XP for work that cannot be proven.

Before progression becomes visible, `coachingDecisions` / effective target data should be connected to `effectivePrescribedUnits`.
