# LetMeFly — Rebuilt Source of Truth

LetMeFly is a mobile-first strength, conditioning, and coaching PWA built around a **Public App Shell + Private Athlete Data** architecture.

The repository currently uses an audited reconstruction pipeline: an immutable V5.4 source archive is expanded during CI, governed program-data packages are applied, then the Command V2 / mobile / exercise-art overlays are layered and audited before the production build.

## Architecture boundaries

- Public application source contains program logic, exercise intelligence, UI, progression rules, workout services, and coaching infrastructure.
- Private athlete information belongs in local/private storage and optional authenticated cloud storage, never in the public repository.
- IndexedDB is the active local workout database.
- Supabase Auth + PostgreSQL provide the optional cloud synchronization layer.
- Local-only training remains supported; cloud initialization never gates workout access.
- Completed workouts snapshot their prescriptions so later program revisions do not rewrite training history.
- Program packages own prescriptions. Registry/facade files must not contain hard-coded workout prescriptions.

## Current governed program coverage

### Crownforge

Governing release: **Crownforge Revised Integrated v2.1**.

The current modular program-data overlay owns:

- `src/programs/crownforge/` — Crownforge Weeks **1–14** and Crownforge governance rules.
- `src/programs/crown-maintenance/` — the separate mandatory **3-week Crown Maintenance bridge**.

The build audits protect source-specific invariants including the Week 10 bench exposure, Week 12 deload, Weeks 13–14 governed testing, maintenance loading references, and program/exercise-library resolution.

Crownforge source changes must be intentional and traceable to the governing program source. Workout execution must never silently rewrite the program.

### Black Crown

Governing release: **Black Crown Revised v2.0**, 54 weeks.

`src/programs/black-crown/` is an independent modular package, but its detailed 54-week prescriptions are still **catalog-only** in the current build until the governing Black Crown source is intentionally imported and audited.

Do not invent missing Black Crown sessions or infer them from Crownforge. The canonical human-readable Black Crown source is maintained separately from the public app code.

## Exercise intelligence and artwork

The app keeps exercise intelligence separate from program prescriptions. Programmed exercise names must resolve through the Exercise Intelligence Library, and substitutions must preserve the programmed movement purpose and training role.

The public build supports exercise-art hooks and private/approved artwork resolution without hard-coding JP's private athlete profile into the repository.

## What this rebuild preserves

- Public App Shell + Private Athlete Data
- IndexedDB workout storage
- optional local-only training
- Supabase Auth + PostgreSQL synchronization
- revision-checked, idempotent sync behavior
- safe first-account bootstrap
- backup/export and restore/import
- legacy localStorage discovery/migration without deleting the original
- mobile-first Workout Mode
- readiness intake and set-level logging
- RPE/RIR recording and barbell plate helper
- program-history snapshots
- Private Vault cloud status
- PWA service-worker privacy boundaries

## Development and production pipeline

The production source is reconstructed by the versioned CI scripts rather than by editing `.build-src` directly.

Key flow:

1. Validate and unpack `source/LETMEFLY_REBUILT_SOURCE_V5_4_UI_COMMAND_B4.zip`.
2. Apply governed modular program-data overlays.
3. Apply Command V2 / mobile / exercise-art overlays.
4. Run source, Crownforge, exercise-library, UI, and TypeScript audits.
5. Build the Vite production bundle.
6. Netlify publishes `.build-src/letmefly_app/dist`.

Do **not** reorganize or bypass `source/`, `ci/`, or `overlays/` casually; the current production reconstruction pipeline depends on those paths and checksum boundaries.

Requirements:

- Node.js 22.12+
- npm

Public browser configuration is limited to the publishable Supabase values required by the client. Never commit service-role keys, database passwords, SMTP passwords, administrative credentials, or private athlete records.

## Startup order

1. Open/upgrade IndexedDB.
2. Recover stale outbox operations.
3. Discover legacy localStorage if no canonical athlete exists.
4. Load local athlete/program/workout.
5. Render the training UI.
6. Start the optional cloud/auth layer.
7. Opportunistically synchronize.

## Workout write rule

Completing a set writes the set and its synchronization outbox operation in the same local transaction and does not wait for Supabase.

Starting a workout creates the session/exercise/set skeleton atomically so a browser interruption cannot leave a half-created session that appears complete.

## PWA privacy boundary

The service worker may cache the public shell and public assets. It must bypass Supabase/auth/private API traffic and private backup downloads.

## Source-of-truth rule

When sources disagree, use this order:

1. Current governed program package and its audit rules.
2. Current approved human-readable program source.
3. Current repository build/CI documentation.
4. Historical rebuild notes and archived files.

Historical documents are useful evidence, but they must not override a later audited program-data import or correction.
