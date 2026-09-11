# LetMeFly Exercise Intelligence Overlay

This folder is an **inert, non-prescription data overlay** whose immutable base is
generated from `LetMeFly_Exercise_Intelligence_Master_v7_QA_CLEAN_INTEGRATION_READY.xlsx`.
Governed program supplements may extend that descriptive catalog without changing
the base payload or taking ownership of program prescriptions.

## Current coverage

Immutable v7 base:

- 92 canonical exercises
- 92/92 movement-role coverage
- 92/92 coaching-detail coverage
- 25 governed substitution rules
- exact base payload hash preserved

Current production catalog with the governed Black Crown v2.1 lateral-glute
supplement:

- 94 canonical current-app exercises
- 94/94 movement-role coverage
- 94/94 coaching-detail coverage
- 94/94 `READY FOR REVIEW`
- 27 governed substitution rules
- 25 substitution rules whose alternatives already exist in the current app
- 2 explicit `DO NOT DEFAULT` relationships
- 2 new Black Crown v2.1 exercises with direct-verified demonstration videos
- 11 legacy direct-demo candidates still intentionally unpromoted pending exact URL validation

## Hard boundary

This overlay **does not own program prescriptions**. Crownforge, Crown Maintenance,
and Black Crown program packages remain authoritative for exercise selection,
sets, reps, percentages, loads, RPE/RIR, tempo, rest, phase logic, testing,
deloads, progression, and schedule structure.

A substitution may be surfaced only when its rule allows it. The application must
respect `promotionStatus`, `rolePreserved`, `useCondition`, and
`programOwnershipRule`.

Issue #54 adds one intentionally narrow mutation boundary: from an **active Workout
Mode exercise only**, an athlete may apply an eligible governed alternative as
**Use This Substitute for Today**. That operation changes the current workout
instance, not the program package. The original programmed movement remains
snapshotted as prescription/provenance, completed substitute performance is
attributed to the performed movement, and future program occurrences continue to
start from the original program prescription.

`candidateDirectUrl` values are review candidates only and must not replace the
current demo URL until intentionally validated. A program supplement may add a
direct demo only when its record is explicitly marked `direct-verified` and the
installer validates it as a direct watch URL.

Private thumbnail Drive IDs/URLs are provenance, not public runtime assets.

## Payload packaging

The immutable v7 JSON is stored losslessly as four gzip+base64 transport chunks in
`payload/`. `payload/manifest.json` records the source JSON hash, gzip hash,
base64 hash, individual part hashes, byte counts, and expected base record counts.

All four parts are exactly 8,486 characters. They must be concatenated in
lexicographic filename order.

Verify without writing a materialized file:

```bash
node overlays/exercise-intelligence/materialize.mjs --verify-only
```

Materialize the immutable base JSON:

```bash
node overlays/exercise-intelligence/materialize.mjs \
  --output=/tmp/letmefly-exercise-intelligence-v1.json
```

The materializer fails closed on any part-length, SHA-256, gzip, JSON, exercise
count, or substitution-rule count mismatch.

`black-crown-v2-1-supplement.json` is a separate governed extension. It adds
Machine Hip Abduction and Seated Band Hip Abduction plus the two Black Crown-owned
fallback relationships for the lateral-hip slot. Mini-Band Lateral Walk already
exists in the immutable base and is reused as the contextual second fallback.

## Build protection

`ci/verify-exercise-intelligence.sh` verifies the immutable transport payload and
the program-prescription ownership boundary. Netlify runs this verification before
the production build. Dedicated GitHub Actions workflows independently protect
the base Exercise Intelligence payload, descriptive Coach layer, Exercise-page
substitution viewer, Coach substitution guidance, and Black Crown v2.1 program
supplement.

`ci/install-exercise-intelligence-v1.sh` materializes a privacy-safe runtime copy
to `/data/exercise-intelligence-v1.json`, installs the read-only lookup API, and
installs the INFO modal UI. It rejects private Drive provenance, duplicate IDs,
unexpected base record counts, changed payload hashes, or a missing service-worker
shell.

`ci/install-exercise-intelligence-v2-supplement.sh` applies the recognized Black
Crown v2.1 descriptive supplement after the immutable v7 base is installed. It
checks the 92/25 base counters, rejects schema drift, verifies review readiness,
requires direct-verified demos for the two new exercises, recomputes role/coaching/
review coverage from the merged catalog, checks the exact Machine Hip Abduction
fallback hierarchy, and produces the governed 94/27 runtime catalog.

`ci/install-exercise-intelligence-coach-v1.sh` adds isolated exercise-aware Coach
behavior. It requires the read-only Exercise Intelligence runtime to already exist,
adds offline-cached JavaScript/CSS resources, and fails if the layer gains
persistent storage, substitution-rule access, network requests, or program-write
hooks.

`ci/install-exercise-intelligence-coach-substitutions-v1.sh` adds the governed
Coach substitution answer path. It may read the same transient exercise-name
context and governed runtime substitution rules, but it has no Apply/Swap action,
persistent storage, network write, or program mutation path.

`ci/install-exercise-intelligence-substitutions-v1.sh` installs the governed
substitution guidance viewer. Outside an active workout it remains view-only.
Inside active Workout Mode it may expose **Use This Substitute for Today** for an
eligible current-app governed rule, but the public viewer itself still has no
direct localStorage, sessionStorage, IndexedDB, or program-package write path. It
can request the operation only through the compiled Workout Mode substitution
bridge. Its dedicated audits protect that narrow boundary and all default-blocked
relationships.

`ci/audit-exercise-intelligence-production-v1.sh` runs against the **finished
production dist after all later LetMeFly installers**. It recognizes either the
immutable 92/25 base or the explicitly governed Black Crown v2.1 94/27 schema. It
recomputes coverage from the actual runtime records, verifies schema consistency,
review status, direct-demo state for supplement exercises, privacy, offline
precache, all Exercise Intelligence assets, protected substitutions, and that
program packages remain the declared prescription authority.

## Runtime status

The Exercise Intelligence overlay remains a **non-prescription intelligence
layer**. The Exercises page `INFO` button can use the intelligence API to show
purpose, movement roles, equipment, primary/secondary muscles, coaching cues,
common mistakes, and the current Watch Exercise link. Governed substitution rules
may also be read by the active Workout Mode bridge, but only the private workout
service may persist a current-session substitute.

The INFO enhancement fails open: if the intelligence payload is unavailable or a
name cannot be resolved, the existing LetMeFly INFO behavior remains available.
It does not read or mutate workout prescription state.

### Exercise-aware Coach v1

When `ASK COACH` is opened from a workout exercise card, the Coach overlay stores
only that exercise name in transient `sessionStorage`. The Coach page exposes an
**Exercise Coaching Context** selector backed by the full governed production
Exercise Intelligence catalog (94 exercises with Black Crown v2.1 active). An
exercise explicitly named in the question takes precedence over remembered or
selected context.

With valid exercise context, Coach can answer three descriptive intent families:

- **Set focus / cues / technique / form** — purpose, up to three coaching cues,
  common mistakes to avoid, and primary emphasis.
- **Why / purpose** — what the movement contributes and its movement-role taxonomy.
  This answer explicitly does **not** claim why the active program placed it in a
  particular week, day, slot, phase, or loading scheme; that remains program-owned.
- **Muscle emphasis** — primary and secondary/stabilizing muscles while preserving
  the movement's training-purpose framing.

If canonical exercise context is unavailable, the overlay does **not** invent an
answer; LetMeFly's existing program/day Coach handler remains in control. Other
Coach questions also continue through that existing handler.

Every exercise-aware response displays a **PROGRAM PRESCRIPTION LOCKED** boundary.
It cannot change the exercise, sets, reps, load, rest, progression, readiness
rules, phase, or program position.

### Governed Coach substitution guidance v1

When Coach receives a substitute/substitution/swap/alternative/replacement question
and a canonical exercise is named or selected, it reads that movement's governed
runtime substitution rules and presents a **GOVERNED SUBSTITUTIONS • VIEW ONLY**
answer.

The Coach answer separates:

- current-app options available to consider;
- protected `DO NOT DEFAULT` relationships; and
- future library candidates that are not canonical current-app exercises.

Each rule can explain fit grade, role preservation, important differences, loading
adjustment, use condition, and coaching rationale. If no canonical exercise or no
governed rule exists, the original program-aware Coach remains the fallback.

This is explanation only. Coach cannot apply a substitution or mutate the active
workout from this path. Applying a substitute, when allowed, is a separate explicit
action from the corresponding active Workout Mode exercise card.

### Governed substitution viewer v1

When a `SUBSTITUTE` button resolves to one or more governed rules, LetMeFly opens a
role-preserving substitution guide. The viewer separates:

- current-app governed options that are eligible to be considered;
- protected `DO NOT DEFAULT` relationships; and
- future library candidates that are not canonical current-app exercises.

Each rule shows fit grade, role-preservation status, important differences,
loading adjustment, use condition, and the coach explanation. Available current-
app alternatives can expose their Watch Exercise link.

Outside active Workout Mode the guide is **VIEW ONLY**. From an active workout
exercise, eligible current-app options may expose **USE THIS SUBSTITUTE FOR TODAY**.
The viewer does not write private storage itself; it delegates to the compiled
Workout Mode bridge, which revalidates the governed rule before calling the private
workout service. The service preserves the original programmed exercise,
substitution provenance, set structure, and reversible load baseline. It refuses
to relabel completed substitute sets; those sets must be reopened before changing
or reverting the movement.

Load is not copied blindly. Same-load or deterministic percentage adjustments may
be prefilled when the governed rule supports them. Bodyweight/unloaded rules may
clear meaningless external load. When no deterministic conversion exists, the
athlete receives an editable starting-load field while the programmed sets/reps or
metric structure remains intact.

The protected default relationships remain:

- Romanian Deadlift → Hamstring Curl — changes a loaded hinge/lengthened posterior-
  chain role into knee-flexion isolation.
- Strict Overhead Press → Push Press — changes strict vertical strength into a
  leg-driven power movement.

The Black Crown v2.1 Machine Hip Abduction fallbacks are additive and program-owned:

- Machine Hip Abduction → Seated Band Hip Abduction — `PROMOTE CORE`, role preserved.
- Machine Hip Abduction → Mini-Band Lateral Walk — `PROMOTE CONTEXTUAL`, role mostly
  preserved with additional standing frontal-plane control.

Any actual substitution still requires an existing governed rule or an intentional
coaching/program-edit decision. Issue #54 does not make Exercise Intelligence the
program owner: **Use This Substitute for Today** changes only the current workout
instance, and future occurrences return to the unchanged program prescription.

Exercise Intelligence public-shell resources, including INFO, exercise-aware
Coach, Coach substitution guidance, and the substitution viewer, are precached for
installed/offline use. This does not cache private athlete APIs or move private
athlete data into the public shell.
