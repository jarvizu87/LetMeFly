# LetMeFly Exercise Intelligence Overlay

This folder is an **inert, non-prescription data overlay** whose immutable base is
generated from `LetMeFly_Exercise_Intelligence_Master_v7_QA_CLEAN_INTEGRATION_READY.xlsx`.
Governed supplements may extend that descriptive catalog without changing the base
payload or taking ownership of program prescriptions.

## Governed catalog lineage

### Immutable v7 base

- 92 canonical exercises
- 92/92 movement-role coverage
- 92/92 coaching-detail coverage
- 92/92 `READY FOR REVIEW`
- 25 governed substitution rules
- exact base payload hash preserved

### Black Crown v2.1 lateral-glute supplement

`black-crown-v2-1-supplement.json` extends the immutable base to:

- 94 canonical exercises
- 94/94 movement-role coverage
- 94/94 coaching-detail coverage
- 94/94 `READY FOR REVIEW`
- 27 governed substitution rules
- Machine Hip Abduction and Seated Band Hip Abduction added
- two program-owned Machine Hip Abduction fallback relationships added
- Mini-Band Lateral Walk reused from the immutable base
- both newly added movements have direct-verified demonstration videos

### Active-program coverage v1

`active-program-coverage-supplement-v1.json` extends the governed 94/27 catalog to:

- **108 canonical exercises**
- **108/108 movement-role coverage**
- **108/108 coaching-detail coverage**
- **108/108 `READY FOR REVIEW`**
- **27 governed substitution rules unchanged**
- 14 source-backed active-program exercise identities added
- 13 intentional compound/choice program display names remain program-owned rather
  than being collapsed into false canonical exercise identities

The 14 added canonical identities are:

1. 90/90 Hip Mobility
2. Box Jump
3. Box Squat
4. Broad Jump
5. Explosive Push-Up
6. Finger Extension
7. Hip Airplane
8. KB Dead-Stop Swing
9. Medicine Ball Chest Pass
10. Rack Pull
11. Reverse Lunge
12. Snatch-Grip RDL
13. Sorenson Hold
14. Trap-3 Raise

The 13 intentional program-owned display names are:

- Bike / Incline Walk
- Bike / Row / Walk
- Bike / Walk
- Bike or Walk
- Walk or Bike
- Dead Bug or Hollow Hold
- Front Squat + Bench Ramp Sets
- KB Lateral Clean or Outside Swing to Rack
- Pull-Up or Lat Pulldown
- Reverse Crunch or Dead Bug
- Wide or Neutral Pulldown
- Curl
- Pushdown

Those labels describe a choice, compound prescription, or intentionally generic
program slot. They are **not** separate canonical exercises and must not be mapped
to one specific movement merely to make a name-resolution metric reach 100%.

## Source boundary

The historical
`Crown_System_Master_Training_Workbook_2026_2027_ANDROID_DEMOS_ALTERNATIVES_STRESS_TESTED_v12.xlsx`
contains 202 active-plan exercise/demo entries and remains an approved reference
source for identity, role, equipment, and demo research. It must **not** replace the
current registry wholesale. Current audited program and Exercise Intelligence
governance wins any conflict with that older source.

The active-program coverage supplement promotes only the 14 source-backed identities
needed by the current live program packages. It adds **zero substitution rules**.

## Hard boundary

This overlay **does not own program prescriptions**. Crownforge, Crown Maintenance,
and Black Crown program packages remain authoritative for exercise selection,
sets, reps, percentages, loads, RPE/RIR, tempo, rest, phase logic, testing,
deloads, progression, and schedule structure.

A substitution may be surfaced only when its rule allows it. The application must
respect `promotionStatus`, `rolePreserved`, `useCondition`, and
`programOwnershipRule`.

`candidateDirectUrl` values are review candidates only and must not replace the
current demo URL until intentionally validated. The 14 active-program coverage
records intentionally use safe YouTube search fallbacks until a direct instructional
video is separately vetted. A program supplement may add a direct demo only when its
record is explicitly marked `direct-verified` and the installer validates it as a
direct watch URL.

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
count, or substitution-rule count mismatch. It always protects the immutable 92/25
base; governed runtime supplements are applied later by dedicated installers.

## Build order and protection

The governed production order is:

1. `ci/install-exercise-intelligence-v1.sh` — immutable 92/25 base
2. `ci/install-exercise-intelligence-v2-supplement.sh` — Black Crown v2.1 → 94/27
3. `ci/install-exercise-intelligence-active-program-coverage-v1.sh` — active-program coverage → 108/27
4. `ci/install-exercise-intelligence-library-v1.sh` — full catalog UI
5. descriptive Coach and view-only substitution layers
6. final production audits

`ci/verify-exercise-intelligence.sh` verifies the immutable transport payload and
the program-prescription ownership boundary. Netlify runs this verification before
the production build.

`ci/install-exercise-intelligence-v1.sh` materializes a privacy-safe runtime copy
to `/data/exercise-intelligence-v1.json`, installs the read-only lookup API, and
installs the INFO modal UI. It rejects private Drive provenance, duplicate IDs,
unexpected base record counts, changed payload hashes, or a missing service-worker
shell.

`ci/install-exercise-intelligence-v2-supplement.sh` checks the 92/25 base counters,
rejects schema drift, verifies review readiness, requires direct-verified demos for
the two Black Crown v2.1 exercises, recomputes coverage, protects the exact Machine
Hip Abduction fallback hierarchy, and produces 94/27.

`ci/install-exercise-intelligence-active-program-coverage-v1.sh` requires the exact
94/27 Black Crown v2.1 input and adds exactly the 14 source-backed exercise IDs. It
adds no substitution rules, preserves the Black Crown supplement/fallback hierarchy,
requires the exact 13 compound program labels, rejects cross-exercise identity
collisions and private Drive/secrets, recomputes coverage, and produces the governed
`1.2-active-program-coverage` **108/27** runtime payload.

`ci/install-exercise-intelligence-library-v1.sh` requires the final 108/27 payload
before installing the append-only full-catalog enhancer. Existing program-derived
cards remain intact; only canonical records not already represented are appended.
The library has no persistent storage, fetch path, Apply/Swap control, or program
mutation path.

`ci/install-exercise-intelligence-coach-v1.sh` adds isolated exercise-aware Coach
behavior. It requires the read-only Exercise Intelligence runtime to already exist,
adds offline-cached JavaScript/CSS resources, and fails if the layer gains
persistent storage, substitution-rule access, network requests, or program-write
hooks.

`ci/install-exercise-intelligence-coach-substitutions-v1.sh` adds the governed
Coach substitution answer path. It may read transient exercise-name context and the
governed runtime substitution rules, but it has no Apply/Swap action, persistent
storage, network write, or program mutation path.

`ci/install-exercise-intelligence-substitutions-v1.sh` installs the governed
Exercise-page substitution guidance viewer. It may read runtime substitution rules
and intercept the existing `SUBSTITUTE` button when a governed rule exists, but it
has no apply control and no storage or program-write path.

`ci/audit-exercise-intelligence-production-v1.sh` runs against the **finished
production dist after all later LetMeFly installers**. It recognizes and protects
all three governed states when appropriate: immutable 92/25, Black Crown v2.1
94/27, and active-program coverage 108/27. In the final 108 state it verifies all
14 added records, the exact 13 compound-label governance list, unchanged 27-rule
substitution set, Black Crown v2.1 direct demos/fallback hierarchy, coverage counters,
privacy, offline resources, read-only Coach/substitution boundaries, and program
package prescription ownership.

`ci/audit-exercise-intelligence-library-production-v1.sh` requires the final
108-record catalog and protects the append-only library architecture, canonical art
keys, offline caching, and no-write/no-fetch UI boundary.

The dedicated GitHub workflow
`.github/workflows/exercise-intelligence-active-program-coverage-audit.yml` builds
and validates the 94→108 transformation independently before promotion to `main`.

## Runtime status

The overlay remains an **active read-only descriptive layer**. The Exercises page
`INFO` button can show purpose, movement roles, equipment, primary/secondary muscles,
coaching cues, common mistakes, and the current Watch Exercise link for canonical
records.

The INFO enhancement fails open: if the intelligence payload is unavailable or a
name cannot be resolved, the existing LetMeFly INFO behavior remains available. It
does not read or mutate workout prescription state.

### Full governed Exercises catalog

The Exercises page preserves every existing program-driven card and augments it with
canonical Exercise Intelligence records that are not already represented. Search and
filters operate across the combined visible library. Program display aliases remain
visible and the UI distinguishes visible library entries from canonical-record count.
Canonical art keys feed the existing automatic JP/Cloudinary resolver when approved
art exists.

### Exercise-aware Coach v1

When `ASK COACH` is opened from a workout exercise card, the Coach overlay stores
only that exercise name in transient `sessionStorage`. The Coach page exposes an
**Exercise Coaching Context** selector backed by the full governed production
Exercise Intelligence catalog (**108 canonical exercises** when active-program
coverage is installed). An exercise explicitly named in the question takes
precedence over remembered or selected context.

With valid exercise context, Coach can answer descriptive set-focus/technique,
why/purpose, and muscle-emphasis questions. It does not claim ownership of why a
program placed a movement in a particular week/day/slot or alter the prescription.
Every exercise-aware response displays a **PROGRAM PRESCRIPTION LOCKED** boundary.

### Governed substitution guidance

Coach and the Exercise-page substitution viewer remain **VIEW ONLY**. They separate
current-app governed options, protected `DO NOT DEFAULT` relationships, and future
library candidates. They may explain fit grade, role preservation, important
differences, loading adjustment, use condition, and coaching rationale.

The protected default relationships remain:

- Romanian Deadlift → Hamstring Curl — changes a loaded hinge/lengthened posterior-chain role into knee-flexion isolation.
- Strict Overhead Press → Push Press — changes strict vertical strength into a leg-driven power movement.

The Black Crown v2.1 Machine Hip Abduction fallbacks remain additive and program-owned:

- Machine Hip Abduction → Seated Band Hip Abduction — `PROMOTE CORE`, role preserved.
- Machine Hip Abduction → Mini-Band Lateral Walk — `PROMOTE CONTEXTUAL`, role mostly preserved with additional standing frontal-plane control.

Any actual substitution still requires an existing governed program rule or an
intentional coaching/program-edit decision. The intelligence layers explain options;
they do not make or apply the program change.

Exercise Intelligence public-shell resources are precached for installed/offline
use. This does not cache private athlete APIs or move private athlete data into the
public shell.
