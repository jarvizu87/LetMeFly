# LetMeFly Progression Shadow Integration — V5.4 Source Candidate

## Source authority used

- App source: `LETMEFLY_REBUILT_SOURCE_V5_4.zip`
- Source checksum recorded by the current app audit: `48aa4bde71f768d77aa8ba916d53c29c756d31896d6386a2c3cf23831d2492a7`
- App package version: `5.4.0-rebuild.1`
- Crownforge source: embedded governed Crownforge Revised v2.1 data
- Progression engine: v1.6 integration-contract freeze
- Forge XP economics: ruleset 1.0.0

The active UI/GitHub working branches were not modified by this candidate.

## Actual V5.4 schema mapping

The adapter maps the current private workout records directly:

- `workoutSessions.id` -> progression `workoutId`
- `workoutSessions.athlete_id` -> `athleteId`
- `workoutSessions.program_instance_id` -> `programRunId`
- `workoutSessions.program_key` -> `programId`
- `workoutSessions.program_version` -> `programVersion`
- `workoutSessions.week_number` -> program week
- `workoutExercises.id` -> session-specific progression item identity
- `workoutExercises.exercise_key` -> canonical source exercise identity
- `workoutExercises.prescription_snapshot.priority` -> mandatory / conditional / optional
- `workoutExercises.prescription_snapshot.category` -> progression work role
- `workoutExercises.group_key` + governed ProgramDay section -> circuit/group identity
- `workoutSets.completed` -> completed work units
- `workoutSets.performance_data` -> source prescription metadata
- `workoutExercises.substituted_from_exercise_key` -> original XP identity for approved substitutions

## Important schema protections added

### Warm-up cap

V5.4 stores warm-up drills as individual exercises. The progression rules cap a warm-up **block** at 20 XP, so the adapter aggregates the governed Warm-Up section into one progression item. It does not award a fresh 10–20 XP base for every warm-up drill.

### Optional sets inside a non-optional exercise

V5.4 sometimes represents a source range such as 3–4 sets by putting the optional final set inside one conditional exercise. The adapter detects governed optional-set notes and splits the progression representation into:

- core work; and
- optional bonus work.

Skipping the optional top-of-range set therefore cannot reduce core adherence.

### Readiness

- Green: conditional work is active by default.
- Yellow: V5.4 stores the readiness/cut rule as prose, not as a structured per-exercise decision. The progression adapter **refuses to guess** and requires an explicit conditional-activation map.
- Red: conditional support defaults inactive; safety handling can preserve the scheduled-event streak, but unperformed training earns no phantom XP.
- Optional work is removed from the effective progression prescription on Yellow/Red.

### Readiness XP farming protection

Readiness completion is keyed to athlete + calendar day. Editing/saving readiness repeatedly on the same day cannot repeatedly award the 10 XP readiness reward.

## Real Crownforge W1D1 Shadow audit

The audit used the actual embedded V5.4 Crownforge Week 1 Day 1 source dated **2026-09-07**:

`LOWER + PUSH STRENGTH / GLUTES`

Green/full-completion result:

- source exercise records: **16**
- progression items after warm-up aggregation/normalization: **12**
- warm-up blocks: **1**
- core potential XP: **672**
- optional potential XP: **16**
- earned core XP: **672**
- earned optional XP: **16**
- group completion bonuses: **30**
- full-session bonus: **34**
- workout XP: **752**
- readiness completion XP: **10**
- total first-session Shadow ledger: **762 XP**
- resulting level: **1**
- Main Quest status: **COMPLETE**
- pending progression commands: **0**
- dead letters: **0**
- Shadow diagnostic health: **PASS**
- Yellow no-guess guard: **PASS**

This is a canonical-program/schema audit fixture, not a claim about an athlete's actual completed performance.

## Regression results after integration

- strict TypeScript app audit with the same narrow Supabase declaration approach used by the source audit: PASS
- source security/private-data audit: PASS
- private localStorage writes: 0
- Crownforge Week 1 audit: PASS
- Crownforge Week 2 audit: PASS
- Crownforge Weeks 3–6 individual audits: PASS
- Crownforge Weeks 1–6 calendar regression: PASS
- exercise intelligence audit: PASS
- progression W1D1 Shadow audit: PASS

## Runtime behavior

The integration is intentionally invisible:

1. saving readiness writes the normal LMF readiness record first;
2. progression separately records the once-per-day readiness reward in Shadow storage;
3. starting a workout creates the private Main Quest projection;
4. active workout cards remain unchanged;
5. set logging remains owned by the existing workout service;
6. completing a workout causes progression to read the final private WorkoutBundle and calculate XP;
7. progression errors remain fail-open and do not block workout logging;
8. progression uses its own IndexedDB database: `letmefly-progression-shadow-v1`;
9. no progression UI is rendered in SHADOW mode.

## Known integration gap intentionally preserved

Yellow readiness still needs a structured Program/Coach decision telling the progression adapter which conditional support work remains active. The current V5.4 app has prose readiness rules but no per-exercise effective-prescription record for this case.

The adapter intentionally fails open rather than silently inventing that decision.

That should be solved in the coaching/effective-prescription lane before visible gamification is enabled.
