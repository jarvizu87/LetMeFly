# LetMeFly Exercise Intelligence Architecture

## Purpose

Exercise Intelligence is LetMeFly's governed knowledge layer for explaining and
reasoning about exercises without taking ownership of workout prescriptions.

It supports:

- canonical exercise identity and aliases;
- movement roles and training categories;
- equipment context;
- training purpose;
- primary and secondary/stabilizing muscles;
- concise coaching cues;
- common execution mistakes;
- demonstration metadata;
- role-preserving substitution reasoning.

It does **not** own programmed exercise selection, sets, reps, loading,
percentages, RPE/RIR, tempo, rest, weekly structure, testing, deloads, or
progression.

## Authority hierarchy

For an active workout:

1. Safety / medical-scope boundary
2. Private athlete state and limitations
3. Governing program package and its local rules
4. Current program phase/week/day/session
5. Exercise Intelligence
6. General coaching knowledge

If Exercise Intelligence conflicts with a governed program prescription, the
program prescription wins unless an intentional coaching/program-edit decision is
made.

## Current canonical coverage

The current app registry contains 92 canonical exercises. The v1 intelligence
payload has:

- 92 / 92 exercise identities
- 92 / 92 movement-role and purpose records
- 92 / 92 muscle-group records
- 92 / 92 cue/common-mistake records
- 25 governed substitution rules
- 23 rules with alternatives already present in the current app
- 2 explicit `DO NOT DEFAULT` relationships
- 11 direct-demo candidates held for manual URL validation

The current workbook authority for this layer is:

`LetMeFly_Exercise_Intelligence_Master_v7_QA_CLEAN_INTEGRATION_READY.xlsx`

## Repository layout

```text
overlays/exercise-intelligence/
├── README.md
├── materialize.mjs
├── payload/
│   ├── manifest.json
│   ├── exercise-intelligence-v1.part-001.b64
│   ├── exercise-intelligence-v1.part-002.b64
│   ├── exercise-intelligence-v1.part-003.b64
│   └── exercise-intelligence-v1.part-004.b64
└── runtime/
    ├── exercise-intelligence-runtime-v1.js
    ├── exercise-intelligence-ui-v1.js
    └── exercise-intelligence-ui-v1.css
```

The canonical JSON is gzip-compressed and base64-encoded into four exact 8,486
character transport chunks. `payload/manifest.json` records the source JSON,
gzip, base64, and part-level hashes.

## Build and release gates

### Payload verification

`ci/verify-exercise-intelligence.sh`

- verifies the part hashes and lengths;
- reconstructs the exact gzip/base64 payload;
- verifies the source JSON SHA-256;
- checks expected 92 exercise / 25 substitution counts;
- verifies the program-package prescription boundary.

### Runtime installation

`ci/install-exercise-intelligence-v1.sh`

- materializes `/data/exercise-intelligence-v1.json`;
- checks the exact JSON SHA-256;
- rejects duplicate exercise IDs;
- rejects private thumbnail Drive provenance in the public runtime JSON;
- confirms two default-blocked substitutions remain blocked;
- installs the read-only runtime lookup API;
- installs the INFO modal JS/CSS;
- injects runtime dependencies in deterministic order.

### CI

`.github/workflows/exercise-intelligence-audit.yml`

The dedicated audit verifies the transport, read-only runtime boundary,
materialized data, and a synthetic runtime installer smoke test.

The normal Command V2 build also runs the production installer, so the final
artifact is tested in the actual LetMeFly pipeline.

Netlify verifies the payload before starting the production build.

## Runtime API

`exercise-intelligence-runtime-v1.js` fetches the public static JSON and exposes a
read-only browser API:

- `window.LetMeFlyExerciseIntelligenceLoader`
- `window.LetMeFlyExerciseIntelligence`
- `getExercise(id | name | alias)`
- `getSubstitutions(id | name | alias, options?)`
- `getAllExercises()`
- `getAllSubstitutionRules()`

The API exposes `programPrescriptionOwner: 'program-packages-only'` as an explicit
architectural marker.

`getSubstitutions()` filters out rules whose alternatives do not exist in the
current app and filters `DO NOT DEFAULT` relationships unless an explicit
inspection mode asks to include blocked rules.

## Exercises page INFO integration

The current UI integration affects only `[data-exercise-info]`.

When the intelligence layer is loaded and a canonical record resolves, INFO shows:

- exercise purpose;
- movement-role and equipment chips;
- primary muscles;
- secondary/stabilizing muscles;
- coaching focus cues;
- common mistakes;
- the current Watch Exercise link;
- a visible program-safety statement.

If the data is unavailable or the exercise does not resolve, the existing
LetMeFly INFO behavior remains untouched.

The UI integration does not read or write workout prescription state and does not
intercept `[data-substitute]`.

## Substitution governance

A same-muscle match is not enough.

Every surfaced substitution must consider:

- movement/training role;
- primary adaptation and stimulus;
- program phase and current session role;
- equipment availability;
- athlete limitations;
- technical/skill requirements;
- fatigue and interference;
- loading-authority changes.

Each substitution rule records:

- fit grade;
- whether the role is preserved;
- important differences;
- loading adjustment;
- use condition;
- evidence basis;
- promotion status;
- Coach explanation;
- program-ownership rule.

Examples deliberately blocked as defaults:

- Romanian Deadlift → Hamstring Curl: loses the loaded hinge / hip-extension role.
- Strict Overhead Press → Push Press: changes strict-strength intent to leg-driven
  overhead power.

A contextual alternative may still be used when the governing program or an
intentional coaching/program-edit decision explicitly changes the role.

## Private-data boundary

Exercise Intelligence is public app-shell knowledge. It may contain public
exercise descriptions and public demonstration metadata.

It must not contain or expose:

- athlete history;
- athlete readiness;
- personal limitations/notes;
- training maxes;
- private workout logs;
- private cloud-storage file URLs or IDs;
- private exercise-art storage paths.

Athlete-aware Coach Mode should combine this public intelligence with private
athlete data at runtime without moving private data into this public overlay.

## Direct-video policy

The current app video URL remains authoritative until a candidate direct source is
manually validated and intentionally promoted.

A legacy or candidate direct URL is not promoted merely because it exists in an
older workbook. This prevents dead links from replacing working search/demo
behavior.

## Next integration sequence

1. Production-validate the read-only runtime and INFO modal.
2. Add offline/cache behavior only after the existing service-worker strategy is
   inspected and the new resources can be integrated without breaking cache
   versioning.
3. Connect Coach Mode to exercise focus/context using the read-only API.
4. Audit runtime substitution context before enhancing the existing SUBSTITUTE
   interaction.
5. Add richer demonstration validation and thumbnails independently of program
   prescription logic.
6. Extend Exercise Intelligence only by preserving canonical IDs and source/evidence
   boundaries.
