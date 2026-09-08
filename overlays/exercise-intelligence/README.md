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

## Runtime status

The overlay is **integration-ready but not yet allowed to rewrite runtime program
data**. Runtime integration must remain descriptive: exercise detail, Coach Mode
context, demo metadata, and role-preserving substitution options. Any actual
program change still requires an existing governed program rule or an intentional
coaching/program-edit decision.
