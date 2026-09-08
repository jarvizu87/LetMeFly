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

## Runtime status

The overlay is **active as a read-only descriptive layer**. The Exercises page
`INFO` button can use the intelligence API to show purpose, movement roles,
equipment, primary/secondary muscles, coaching cues, common mistakes, and the
current Watch Exercise link.

The INFO enhancement fails open: if the intelligence payload is unavailable or a
name cannot be resolved, the existing LetMeFly INFO behavior remains available.
It does not read or mutate workout prescription state.

Exercise Intelligence public-shell resources are precached for installed/offline
use. This does not cache private athlete APIs or move private athlete data into the
public shell.

The existing `SUBSTITUTE` workflow is intentionally **not overridden by this UI
batch**. Broader substitution behavior will be connected only after the governed
rule set is audited for the exact runtime context. Any actual program change still
requires an existing governed program rule or an intentional coaching/program-edit
decision.
