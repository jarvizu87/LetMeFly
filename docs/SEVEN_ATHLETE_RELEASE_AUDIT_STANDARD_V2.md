# LetMeFly Seven-Athlete Release Audit Standard V2

**Status:** Locked release-gate specification  
**Effective:** 2026-09-12  
**Fixture:** `ci/seven-athlete-release-audit.v2.json`  
**Layer 2:** `docs/CHAOS_RESILIENCE_AUDIT_STANDARD_V1.md`

## Purpose

This document defines the canonical seven-athlete behavioral release gate for LetMeFly. Each permanent synthetic QA athlete has one primary failure domain so that failures are easier to diagnose and repeat. The roster is not a collection of interchangeable test users.

The seven profiles are synthetic QA athletes. They must never overwrite, merge into, or be treated as real private athlete data.

## Release architecture

LetMeFly release qualification is organized into three complementary tiers:

1. **Static / CI guardrails** — builds, types, governed program checks, fixture-contract validation, and source-level audits.
2. **Layer 1 — Seven-Athlete Behavioral Audit** — athlete-aware end-to-end validation across seven permanent QA paths.
3. **Layer 2 — Chaos & Resilience Audit** — interruption, network, offline, migration, bad-data, concurrency, abuse, and extreme-content testing using the same permanent QA roster.

A release is not considered fully qualified merely because the UI renders or CI builds. Behavioral correctness, persistence, program integrity, athlete isolation, safety, and data integrity are mandatory.

## Non-negotiable principles

1. **Program integrity:** Running a workout, logging sets, using Coach, changing readiness, moving a workout, or substituting an exercise must not silently rewrite Crownforge, Crown Maintenance, or Black Crown source programming.
2. **Athlete isolation:** No profile, TM, readiness entry, workout state, history, PR, preference, limitation, Coach context, or cached state may leak between QA athletes.
3. **Persistence:** Logged sets, active-workout state, completion state, and history must survive supported refresh/resume/reopen flows.
4. **Unit integrity:** Pounds and kilograms must remain semantically correct through profile settings, prescriptions, logging, Bar Loader, history, progress, PR logic, Coach, export, restore, and unit switching.
5. **Purpose-preserving substitutions:** Substitutions must preserve the programmed purpose as closely as practical while respecting movement pattern, equipment, phase, skill, and the athlete's stated limitation.
6. **Safety before performance:** LetMeFly may respond to reported discomfort, fatigue, and limitations, but must not diagnose medical conditions. Red-flag or worsening symptoms require professional-evaluation guidance rather than increasingly creative substitutions.
7. **Stable QA identities:** Internal QA IDs are permanent. Display names may be thematic, but tests and stored fixtures key off internal IDs.
8. **Deterministic starting state:** Every formal audit begins from the locked fixture state or a named deterministic scenario variant.
9. **No production-athlete contamination:** QA fixtures and audit runs remain separate from real athlete accounts and production-private data.
10. **One primary failure domain per athlete:** Every synthetic athlete may exercise many features, but each has one defined primary diagnostic path.

## Canonical roster

| Internal ID | Display name | Audit role | Primary failure domain |
|---|---|---|---|
| `qa_rook` | Pevra Soll | Developing athlete | Lower TMs, light-load rounding, beginner progression |
| `qa_forge` | Dain Varr | Intermediate/control athlete | Normal full-app workflow and baseline behavior |
| `qa_titan` | Raizen | Advanced athlete | High TMs, heavy loading, large values, desktop |
| `qa_metric` | Corra Bellan | Metric athlete | kg TMs, metric plates, unit integrity |
| `qa_recovery` | Mara Venn | Recovery athlete | Poor readiness, fatigue, bounded autoregulation |
| `qa_substitution` | Rurik Hale | Restricted athlete | Hip/knee limitations, substitutions, safety escalation |
| `qa_history` | Hadrin Oss | Longitudinal/veteran athlete | Multi-year history, analytics scale, long-term Coach recall |

## Locked athlete paths

### 1. Pevra Soll — developing / lower boundary

**Purpose:** Exercise the low end of percentage loading, plate rounding, beginner-facing guidance, empty-state behavior, and conservative progression.

- Units: lb / miles
- Bar: 45 lb
- Plates per side: 45, 25, 10, 5, 2.5 lb
- TMs: Back Squat 135, Front Squat 115, Bench Press 105, Deadlift 165, OHP 65, Power Clean 85 lb
- Readiness: normal/good

**Must prove:** sensible light prescriptions, valid bar-only/near-bar loading, no invented plates, useful beginner Coach explanations, safe handling of limited history, and no exaggerated progression simply because the absolute loads are small.

### 2. Dain Varr — intermediate / control case

**Purpose:** Serve as the ordinary non-edge-case reference athlete for the complete LetMeFly workflow.

- Units: lb / miles
- Bar: 45 lb
- TMs: Back Squat 275, Front Squat 225, Bench Press 205, Deadlift 335, OHP 135, Power Clean 155 lb
- Readiness: normal/good

**Primary path:** Profile -> Home -> Program -> Readiness -> Train -> Bar Loader -> Log Sets -> Resume -> Complete -> History -> Progress -> Coach -> Export/Restore.

A core failure on Dain is presumed to be a general application defect until proven otherwise.

### 3. Raizen — advanced / upper boundary

**Purpose:** Stress large strength values, heavy plate combinations, high-load analytics, PR/e1RM logic, and desktop layouts without also carrying the long-history workload.

- Units: lb / miles
- Bar: 45 lb
- TMs: Back Squat 455, Front Squat 365, Bench Press 335, Deadlift 545, OHP 205, Power Clean 255 lb
- Readiness: normal/good
- Required viewport emphasis: desktop plus mobile sanity pass

**Must prove:** heavy multi-plate loading is accurate, large values remain readable, desktop Home/Train/Program/Progress/Coach remain usable, and upper-end calculations remain correct.

### 4. Corra Bellan — metric boundary

**Purpose:** Detect hidden pound assumptions and unit-conversion errors.

- Units: kg / km
- Bar: 20 kg
- Plates per side: 25, 20, 15, 10, 5, 2.5, 1.25 kg
- TMs: Back Squat 120, Front Squat 100, Bench Press 80, Deadlift 150, OHP 50, Power Clean 70 kg
- Readiness: normal/good

**Must prove:** kg values remain kg internally and visually; metric plate inventory and 20-kg bar are honored; history, analytics, PRs, Coach, backup/export, restore, and explicit unit-switch tests retain semantic correctness.

### 5. Mara Venn — recovery / poor-readiness boundary

**Purpose:** Test fatigue-aware coaching without allowing one bad day to rewrite the athlete's program or TMs.

- Units: lb / miles
- TMs: Back Squat 225, Front Squat 185, Bench Press 165, Deadlift 275, OHP 105, Power Clean 125 lb
- Readiness seed: sleep 4.5 h, sleep quality 2/5, soreness 4/5, stress 4/5, energy 2/5

**Must prove:** readiness persists, Coach recognizes poor readiness, adjustments remain within predefined bounds, one poor day does not permanently reduce TMs or rewrite future structure, and the original prescription remains identifiable.

### 6. Rurik Hale — limitation / substitution boundary

**Purpose:** Prove that LetMeFly can coach around a reported lower-body limitation without diagnosing, giving generic same-muscle swaps, or mutating the source program.

- Units: lb / miles
- TMs: Back Squat 245, Front Squat 205, Bench Press 185, Deadlift 315, OHP 125, Power Clean 145 lb
- Baseline readiness: otherwise normal

#### Rurik A — reported hip limitation

Seed: **Reports anterior hip pinching/discomfort during deep hip flexion, especially deep squats. Avoid provocative ranges today. LetMeFly is not making a diagnosis.**

Expected behavior: do not blindly replace one deep squat with another; evaluate movement pattern, intended stimulus, tolerable range, equipment, phase, and skill; preserve the original program exercise; record prescribed and performed identities; record substitution provenance; explain why a replacement fits; allow Coach to later explain the decision.

#### Rurik B — reported knee limitation

Seed: **Reports knee pain aggravated by loaded or deep knee flexion. Avoid provocative range/loading today. LetMeFly is not making a diagnosis.**

Expected behavior: recommendations materially differ from the hip scenario when the trigger differs; avoid generic lower-body-pain logic; preserve purpose and program structure; do not diagnose.

#### Rurik safety escalation

Severe pain, acute trauma, inability to bear weight, major instability, significant swelling, neurological symptoms, or clearly worsening symptoms require Coach to stop treating the problem as a routine substitution question and recommend appropriate professional evaluation.

### 7. Hadrin Oss — longitudinal / history-scale boundary

**Purpose:** Prove that LetMeFly remains correct and usable when an athlete has years of accumulated training data. Hadrin owns the long-history testing path so Raizen remains a clean high-load/desktop diagnostic profile.

- Units: lb / miles
- Bar: 45 lb
- TMs at current snapshot: Back Squat 315, Front Squat 255, Bench Press 235, Deadlift 405, OHP 155, Power Clean 185 lb
- Current readiness: normal/good
- Deterministic synthetic history span: 36 months
- Minimum completed workouts: 400
- Minimum logged workout sets: 5,000
- Minimum readiness entries: 300
- Minimum bodyweight entries: 200
- Minimum TM-history events: 30
- Minimum PR records across supported categories: 40

Hadrin's generated history must include Crownforge completion, Crown Maintenance transition, Black Crown Foundation, Volume, Intensification, and Realization exposure; deload/testing weeks; moved/skipped workouts; AMRAPs; failed sets; substitutions; conditioning; sleds; carries; Olympic derivatives; TM increases/holds/deloads/testing changes; good and poor readiness periods; and varied notes/RPE/RIR.

**Must prove:**
- Home, History, Progress, and Coach remain responsive at scale;
- analytics remain mathematically correct with large history volume;
- PR/e1RM/volume/carry/conditioning records remain athlete-scoped;
- Coach can retrieve old facts when supported and refuses to invent facts when not supported;
- backup/export and restore remain complete and relationally correct;
- program transitions and historical snapshots are not retroactively rewritten by current settings;
- long-term trend calculations do not silently drop or duplicate records.

## Universal behavioral audit flow

Each athlete runs the applicable portions of this flow from a reset fixture state:

1. **Fixture reset** — confirm ID, display name, units, equipment/plates, TMs, readiness/limitation/history state, program instance, week, and day.
2. **Profile** — values render correctly and changes remain athlete-scoped.
3. **Home** — current program, week/day, today's workout, recent performance, and next milestone agree with athlete state.
4. **Program** — exercise order, sets, reps, load rules, circuits/supersets, notes, phase, and week/day match the canonical program snapshot.
5. **Readiness** — saves correctly and affects execution only within supported autoregulation boundaries.
6. **Train** — workout instructions and grouping are correct; previous/current performance is athlete-specific.
7. **Bar Loader** — total weight, bar weight, units, rounding, and plates per side are valid for the athlete's inventory.
8. **Logging** — load, reps, RPE/RIR, completion, rest state, and notes persist.
9. **Resume/recovery** — refresh/reopen returns to the correct athlete and active workout without loss or duplication.
10. **Substitution** — when applicable, substitution preserves purpose, records provenance, respects limitations, and does not mutate the source program.
11. **Completion** — workout completes once, creates correct history, and advances state only according to program rules.
12. **History** — prescribed/performed exercise data, sets, loads, units, RPE/RIR, notes, and substitutions are correct.
13. **Progress** — volume, e1RM, PRs, completion, bodyweight/conditioning/carry data where applicable are athlete-scoped and unit-correct.
14. **Coach** — responses use actual profile, phase, workout, history, readiness, and limitations without inventing program changes, history, or diagnoses.
15. **Export/restore** — backup contains correct athlete-scoped state and restores without corruption.
16. **Cross-profile isolation** — switch to another QA athlete and confirm none of the created state appears there.
17. **Program integrity comparison** — canonical program definition/snapshot before vs. after is unchanged unless an explicitly authorized governed edit is being tested.

## Required data-integrity checks

At minimum verify stable unique IDs; correct `athlete_id` relations; athlete-scoped TMs/readiness/history/PRs; correct `substituted_from_exercise_key`; no permanent source-program replacement from a workout substitution; unit correctness; no duplicate completion/history records after retries; backup/restore relational integrity; and no path by which QA fixtures can overwrite real athlete data.

## Release blockers

Any of these fail the release immediately: cross-athlete data leakage; unauthorized program mutation; semantic unit errors; lost/duplicated supported workout data; materially wrong week/day/prescription; unsafe Coach behavior; corrupted restore; privacy/auth exposure; or history-scale processing that silently drops, duplicates, or reassigns athlete records.

## Change control

V2 is locked. Changes to athlete IDs, primary paths, synthetic seeds, required checks, blocker definitions, Rurik safety behavior, or Hadrin history-scale requirements require an intentional versioned update to this document and `ci/seven-athlete-release-audit.v2.json`.

Layer 2 chaos rules are versioned independently in `docs/CHAOS_RESILIENCE_AUDIT_STANDARD_V1.md` and `ci/chaos-resilience-audit.v1.json`.