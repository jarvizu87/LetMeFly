# LetMeFly Exercise Intelligence Overlay

This folder is an **inert, non-prescription data overlay** generated from
`LetMeFly_Exercise_Intelligence_Master_v7_QA_CLEAN_INTEGRATION_READY.xlsx`.

## Current coverage

- 92 canonical current-app exercises
- 92/92 movement-role coverage
- 92/92 coaching-detail coverage
- 25 governed substitution rules
- 23 substitution rules whose alternatives already exist in the current app
- 2 explicit `DO NOT DEFAULT` relationships
- 11 direct-demo candidates that still require URL validation

## Hard boundary

This overlay **does not own program prescriptions**. Crownforge, Crown Maintenance,
and Black Crown program packages remain authoritative for exercise selection,
sets, reps, percentages, loads, RPE/RIR, tempo, rest, phase logic, testing,
deloads, progression, and schedule structure.

A substitution may be surfaced only when its rule allows it. The application must
respect `promotionStatus`, `rolePreserved`, `useCondition`, and
`programOwnershipRule`.

`candidateDirectUrl` values are review candidates only and must not replace the
current demo URL until intentionally validated.

Private thumbnail Drive IDs/URLs are provenance, not public runtime assets.

## Payload packaging

The canonical JSON is stored losslessly as four gzip+base64 transport chunks in
`payload/`. `payload/manifest.json` records the source JSON hash, gzip hash,
base64 hash, individual part hashes, byte counts, and expected record counts.

All four parts are exactly 8,486 characters. They must be concatenated in
lexicographic filename order.

Verify without writing a materialized file:

```bash
node overlays/exercise-intelligence/materialize.mjs --verify-only
```

Materialize the canonical JSON:

```bash
node overlays/exercise-intelligence/materialize.mjs \
  --output=/tmp/letmefly-exercise-intelligence-v1.json
```

The materializer fails closed on any part-length, SHA-256, gzip, JSON, exercise
count, or substitution-rule count mismatch.

## Build protection

`ci/verify-exercise-intelligence.sh` verifies the transport payload and the
program-prescription ownership boundary. Netlify runs this verification before
the production build. A dedicated GitHub Actions workflow also verifies and
materializes the payload whenever this overlay changes.

`ci/install-exercise-intelligence-v1.sh` materializes a privacy-safe runtime copy
to `/data/exercise-intelligence-v1.json`, installs the read-only lookup API, and
installs the INFO modal UI. It rejects private Drive provenance, duplicate IDs,
unexpected record counts, changed payload hashes, or a missing service-worker
shell.

The installer also extends the existing public-shell precache with the Exercise
Intelligence JSON, runtime loader, INFO UI JavaScript, and INFO UI stylesheet.
Private Supabase/auth/API requests remain excluded by the existing service-worker
privacy rules. The dedicated CI smoke test verifies both the runtime installation
and the offline precache patch.

`ci/install-exercise-intelligence-coach-v1.sh` adds a second isolated runtime layer
for set-focus coaching. It requires the read-only Exercise Intelligence runtime to
already exist, adds its own offline-cached JavaScript/CSS resources, and fails if
its source starts using localStorage, substitution hooks, or direct program-data
writes.

`ci/install-exercise-intelligence-substitutions-v1.sh` installs the governed
substitution guidance viewer. It may read the v7 substitution rules and intercept
the existing `SUBSTITUTE` button when a governed rule exists, but it has no apply
control and no storage or program-write path. Its dedicated audit locks the current
rule classification totals and the exact two `DO NOT DEFAULT` relationships.

## Runtime status

The overlay is **active as a read-only descriptive layer**. The Exercises page
`INFO` button can use the intelligence API to show purpose, movement roles,
equipment, primary/secondary muscles, coaching cues, common mistakes, and the
current Watch Exercise link.

The INFO enhancement fails open: if the intelligence payload is unavailable or a
name cannot be resolved, the existing LetMeFly INFO behavior remains available.
It does not read or mutate workout prescription state.

### Coach Mode set-focus v1

When `ASK COACH` is opened from a workout exercise card, the Coach overlay stores
only that exercise name in transient `sessionStorage`. The Coach page then exposes
a Set Coaching Context selector backed by the 92 canonical Exercise Intelligence
records.

Questions about focus, cues, technique, form, or the current set can return the
selected exercise's purpose, up to three coaching cues, common mistakes to avoid,
and primary muscle emphasis. A named exercise in the question takes precedence
over the remembered selector context.

If no canonical exercise context is available, the overlay does **not** invent an
answer; LetMeFly's existing program/day Coach behavior remains in control. All
non-focus Coach questions also continue through the existing Coach handler.

The set-focus response is execution coaching only and displays a **PROGRAM
PRESCRIPTION LOCKED** boundary. It cannot change the selected exercise, sets,
reps, load, rest, progression, readiness rules, or program position.

### Governed substitution viewer v1

When a `SUBSTITUTE` button resolves to one or more v7 rules, LetMeFly opens a
**ROLE-PRESERVING SUBSTITUTION GUIDE • VIEW ONLY** rather than silently changing
the active workout. The viewer separates:

- current-app governed options that are eligible to be considered;
- protected `DO NOT DEFAULT` relationships; and
- future library candidates that are not canonical current-app exercises.

Each rule shows fit grade, role-preservation status, important differences,
loading adjustment, use condition, and the coach explanation. Available current-
app alternatives can expose their Watch Exercise link.

The viewer intentionally contains **no Apply/Swap action**. It does not write to
localStorage, sessionStorage, IndexedDB, workout state, program packages, or
private athlete records. If no governed v7 rule exists for a movement, the
existing LetMeFly substitution behavior remains the fallback.

The current protected default relationships are:

- Romanian Deadlift → Hamstring Curl — changes a loaded hinge/lengthened posterior-
  chain role into knee-flexion isolation.
- Strict Overhead Press → Push Press — changes strict vertical strength into a
  leg-driven power movement.

Any actual substitution still requires an existing governed program rule or an
intentional coaching/program-edit decision. The viewer explains options; it does
not make the decision or rewrite the prescription.

Exercise Intelligence public-shell resources, including the set-focus Coach and
substitution-viewer files, are precached for installed/offline use. This does not
cache private athlete APIs or move private athlete data into the public shell.
