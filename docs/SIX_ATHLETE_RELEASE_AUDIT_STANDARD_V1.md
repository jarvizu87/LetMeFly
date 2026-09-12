# LetMeFly Six-Athlete Release Audit Standard V1

**Status:** Locked release-gate specification  
**Effective:** 2026-09-12  
**Fixture:** `ci/six-athlete-release-audit.v1.json`

## Purpose

This document defines the canonical six-athlete release audit for LetMeFly. The goal is to prove that the app behaves correctly across materially different athlete states instead of validating only one personal profile or one happy-path workout.

The six profiles are synthetic QA athletes. They must never be merged into or treated as real private athlete data.

A release may not be considered audit-green unless all required checks below pass or an explicitly documented exception has been approved for a non-blocking item.

## Non-negotiable release principles

1. **Program integrity:** Running a workout, logging sets, using Coach, changing readiness, or substituting an exercise must not silently rewrite Crownforge, Crown Maintenance, or Black Crown source programming.
2. **Athlete isolation:** No profile, TM, readiness entry, workout state, history, PR, preference, limitation, or Coach context may leak between QA athletes.
3. **Persistence:** Logged sets, active-workout state, completion state, and history must survive the supported refresh/resume/reopen flows.
4. **Unit integrity:** Pounds and kilograms must remain correct from profile settings through prescriptions, logging, Bar Loader, history, progress, PR logic, Coach responses, export, and restore.
5. **Purpose-preserving substitutions:** A substitution must preserve the programmed training purpose as closely as practical while respecting equipment, phase, skill, and the athlete's stated limitation.
6. **Safety before performance:** LetMeFly may distinguish ordinary training fatigue/discomfort from a reported limitation, but it must not diagnose a medical condition. Red-flag or worsening symptoms require escalation to appropriate professional evaluation rather than increasingly creative substitutions.
7. **Stable QA identities:** Internal QA IDs are permanent. Display names may be thematic, but tests and stored fixtures must key off the internal IDs.
8. **Deterministic starting state:** Each formal release audit begins from the locked fixture state, not from leftovers from a prior run.
9. **No production-athlete contamination:** QA fixtures and audit runs remain separate from real athlete accounts and production-private data.

## Canonical roster

| Internal ID | Display name | Audit role | Primary stress test |
|---|---|---|---|
| `qa_rook` | Pevra Soll | Developing athlete | Lower TMs, light-load rounding, beginner progression |
| `qa_forge` | Dain Varr | Intermediate/control athlete | Normal full-app workflow and baseline behavior |
| `qa_titan` | Raizen | Advanced athlete | High TMs, heavy loading, large values, advanced progress, desktop |
| `qa_metric` | Corra Bellan | Metric athlete | kg TMs, metric plates, unit integrity |
| `qa_recovery` | Mara Venn | Recovery athlete | Poor readiness, fatigue, bounded autoregulation |
| `qa_substitution` | Rurik Hale | Restricted athlete | Hip/knee limitation handling, substitutions, safety escalation |

## Locked synthetic seeds

The exact machine-readable values live in `ci/six-athlete-release-audit.v1.json`. These values are intentionally synthetic and exist only to create stable repeatable audit boundaries.

### 1. Pevra Soll — developing / lower boundary

**Purpose:** Exercise the low end of percentage loading, plate rounding, beginner-facing guidance, and progression.

- Units: lb / miles
- Bar: 45 lb
- Plates per side inventory: 45, 25, 10, 5, 2.5 lb
- TMs: Back Squat 135, Front Squat 115, Bench Press 105, Deadlift 165, OHP 65, Power Clean 85 lb
- Readiness: normal/good

**Must prove:**
- percentage prescriptions do not create impossible or nonsensical light loads;
- empty-bar and near-empty-bar cases display cleanly;
- Bar Loader never invents unavailable plates;
- beginner Coach explanations remain useful without altering program logic;
- progression is not excessively aggressive merely because absolute numbers are small.

### 2. Dain Varr — intermediate / control case

**Purpose:** Serve as the ordinary, non-edge-case reference athlete for the complete LetMeFly workflow.

- Units: lb / miles
- Bar: 45 lb
- TMs: Back Squat 275, Front Squat 225, Bench Press 205, Deadlift 335, OHP 135, Power Clean 155 lb
- Readiness: normal/good

**Primary path:** Profile -> Home -> Program -> Readiness -> Train -> Bar Loader -> Log Sets -> Resume -> Complete -> History -> Progress -> Coach -> Export/Restore.

A core failure on Dain is presumed to be a general application defect until proven otherwise.

### 3. Raizen — advanced / upper boundary

**Purpose:** Stress large strength values, heavy plate combinations, high-volume analytics, PR/e1RM logic, and desktop layouts.

- Units: lb / miles
- Bar: 45 lb
- TMs: Back Squat 455, Front Squat 365, Bench Press 335, Deadlift 545, OHP 205, Power Clean 255 lb
- Readiness: normal/good
- Required viewport emphasis: desktop plus mobile sanity pass

**Must prove:**
- multiple 45-lb plates per side are represented accurately;
- large prescription, volume, e1RM, and PR values do not overflow or truncate critical UI;
- desktop Home, Train, Program, Progress, and Coach remain usable;
- calculations remain correct at the upper end of expected recreational/advanced strength values.

### 4. Corra Bellan — metric boundary

**Purpose:** Detect hidden lb assumptions anywhere in the data or UI chain.

- Units: kg / km
- Bar: 20 kg
- Plates per side inventory: 25, 20, 15, 10, 5, 2.5, 1.25 kg
- TMs: Back Squat 120, Front Squat 100, Bench Press 80, Deadlift 150, OHP 50, Power Clean 70 kg
- Readiness: normal/good

**Must prove:**
- kg TMs remain kg internally and visually;
- Bar Loader uses the metric plate inventory and a 20-kg bar;
- logged loads, history, analytics, PRs, Coach text, backup/export, and restore retain the correct unit;
- no value is silently converted, compared, or interpreted as pounds unless an explicit supported conversion is requested.

### 5. Mara Venn — recovery / poor-readiness boundary

**Purpose:** Test fatigue-aware coaching without allowing one bad day to rewrite the athlete's program or TMs.

- Units: lb / miles
- TMs: Back Squat 225, Front Squat 185, Bench Press 165, Deadlift 275, OHP 105, Power Clean 125 lb
- Readiness seed: sleep 4.5 h, sleep quality 2/5, soreness 4/5, stress 4/5, energy 2/5

**Must prove:**
- the readiness state is captured and persists;
- Coach recognizes poor readiness and can recommend bounded adjustments only where program rules permit;
- one poor day does not permanently reduce TMs or alter future program structure;
- the original prescription remains identifiable even when today's execution is adjusted;
- the next workout remains intact.

### 6. Rurik Hale — limitation / substitution boundary

**Purpose:** Prove that LetMeFly can coach around a reported lower-body limitation without diagnosing, giving generic same-muscle swaps, or mutating the source program.

- Units: lb / miles
- TMs: Back Squat 245, Front Squat 205, Bench Press 185, Deadlift 315, OHP 125, Power Clean 145 lb
- Baseline readiness: otherwise normal
- Two required sub-scenarios are run under the same permanent QA athlete ID.

#### Rurik A — reported hip limitation

Seed statement: **"Reports anterior hip pinching/discomfort during deep hip flexion, especially deep squats. Avoid provocative ranges today. LetMeFly is not making a diagnosis."**

Audit exercises should include at least one squat/deep-hip-flexion movement plus lower-body movements that may remain tolerable, such as hinges, carries, or sled work.

Expected behavior:
- do not simply swap Front Squat for another deep squat and call the problem solved;
- evaluate movement pattern, intended stimulus, tolerable range, equipment, phase, and skill;
- preserve the original programmed exercise in the program definition;
- save both the prescribed movement and the performed substitute in workout history;
- explain why a suggested substitute fits;
- allow Coach to later answer why a substitute was used.

#### Rurik B — reported knee limitation

Seed statement: **"Reports knee pain aggravated by loaded or deep knee flexion. Avoid provocative range/loading today. LetMeFly is not making a diagnosis."**

Expected behavior:
- recommendations should materially differ from the hip scenario when the limiting factor differs;
- avoid generic `lower-body pain` handling;
- preserve training purpose while respecting the reported knee trigger;
- preserve original program structure and future workouts.

#### Rurik safety escalation

If the scenario is amended to include severe pain, acute trauma, inability to bear weight, major instability, significant swelling, neurological symptoms, or clearly worsening symptoms, Coach must stop treating the problem as a routine substitution question and recommend appropriate professional evaluation. LetMeFly must not diagnose the cause.

## Universal audit flow

Each athlete runs the applicable portions of this flow from a reset fixture state:

1. **Fixture reset** — confirm internal ID, display name, unit system, equipment/plate inventory, TMs, readiness/limitation state, program instance, and current week/day.
2. **Profile** — values render correctly and changes remain athlete-scoped.
3. **Home** — current program, week/day, today's workout, recent performance, and next milestone are consistent with source data.
4. **Program** — exercise order, sets, reps, load rules, circuits/supersets, notes, phase, and week/day match the canonical program snapshot.
5. **Readiness** — entry is saved and used only within allowed autoregulation boundaries.
6. **Train** — workout instructions are correct; group order is preserved; previous/current performance is athlete-specific.
7. **Bar Loader** — total weight, bar weight, units, and plates per side are correct for the athlete's inventory.
8. **Logging** — set load, reps, RPE/RIR, completion, rest state, and notes persist.
9. **Resume/recovery** — refresh/reopen returns to the correct athlete and active workout without losing or duplicating saved sets.
10. **Substitution** — when applicable, substitution preserves purpose, records provenance, and does not mutate the source program.
11. **Completion** — workout is completed once, creates correct history, and advances program state only according to program rules.
12. **History** — prescribed/performed exercise data, sets, loads, units, RPE/RIR, notes, and substitutions are correct.
13. **Progress** — volume, e1RM, PRs, completion, bodyweight/conditioning/carry data where applicable are athlete-scoped and unit-correct.
14. **Coach** — responses use the current athlete profile, program phase, current workout, history, readiness, and limitations without inventing program changes.
15. **Export/restore** — backup contains the correct athlete-scoped state and restores it without unit, TM, history, or program corruption.
16. **Cross-profile isolation** — switch to at least one other QA athlete and confirm none of the just-created state appears there.
17. **Program integrity hash/diff** — compare canonical program definition/snapshot before vs. after. No unauthorized mutation is allowed.

## Required data-integrity checks

The audit harness or operator must verify, at minimum:

- athlete IDs are stable and unique;
- workout records contain the correct `athlete_id`;
- TM history remains athlete-scoped;
- readiness entries remain athlete-scoped;
- `workoutExercises.substituted_from_exercise_key` is populated when a substitution is performed;
- the performed exercise is not written back into the canonical program definition as a permanent replacement;
- units on `workoutSets.load_unit` and TM entries match the athlete setting;
- duplicate completion/history records are not created by refresh/retry;
- backup/restore preserves athlete identity and store relationships;
- a QA fixture cannot overwrite a real athlete record.

## Pass/fail classification

### RELEASE BLOCKER

Any of the following fails the release gate immediately:

- cross-athlete data leakage;
- unauthorized Crownforge/Crown Maintenance/Black Crown mutation;
- wrong units that change the meaning of a load, TM, PR, or Bar Loader result;
- lost or duplicated completed workout/set data in a supported persistence flow;
- wrong program week/day or exercise prescription that could materially change training;
- unsafe Coach behavior in Rurik's limitation/red-flag scenarios;
- backup/restore corruption of athlete identity, program state, TMs, or history;
- authentication/privacy behavior that exposes another athlete's private data.

### MAJOR

Examples: broken substitution provenance, incorrect prior-performance display, incorrect analytics/PR classification, desktop/mobile workflow failure with a supported device, or Coach ignoring available athlete context without creating a direct safety issue.

A Major must be fixed before release unless the release owner explicitly records a justified exception and the defect cannot corrupt training or data.

### MINOR / COSMETIC

Examples: non-blocking spacing, visual polish, or copy issues that do not obscure prescriptions, controls, units, safety information, or logged values.

Minor issues may be carried only when recorded in the release notes/ledger.

## Required release record

For every formal six-athlete audit, record:

- build/commit SHA;
- environment and URL;
- audit date;
- fixture version;
- operator/automation identity;
- result for each athlete and each Rurik sub-scenario;
- defects found and links to fixes/issues;
- program integrity comparison result;
- final release decision: `PASS`, `FAIL`, or `PASS WITH DOCUMENTED MINORS`.

Do not mark the release green merely because the UI renders. Behavioral correctness and data integrity are mandatory.

## Change control

This V1 standard is locked. Changes to athlete IDs, synthetic seeds, required checks, blocker definitions, or Rurik safety behavior require an intentional versioned update to both this document and `ci/six-athlete-release-audit.v1.json`.

Display-name changes alone may be made without changing internal IDs, but must still be reflected in both files so human and machine-readable sources remain synchronized.
