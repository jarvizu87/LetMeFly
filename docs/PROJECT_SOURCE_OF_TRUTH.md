# LetMeFly Project Source of Truth

This file defines how LetMeFly resolves competing sources and historical artifacts. It is intentionally public-safe and contains no athlete profile, training maxes, workout history, credentials, or private storage identifiers.

## 1. Live application code

**GitHub is the live application/build authority.**

The production build is reconstructed from the repository's immutable source base, governed program-data overlays, Command V2/mobile overlays, exercise-art layers, and release audits. The current `source/`, `ci/`, and `overlays/` paths are part of that verified build pipeline and must not be casually reorganized.

A historical source ZIP outside the repository is a recovery artifact only. It does not override a later audited GitHub build.

## 2. Program prescriptions

Program packages own workout prescriptions. Registry, compatibility, UI, history, and workout-runtime files must not become alternate hidden prescription sources.

When a program document and encoded package disagree, do not silently choose whichever is more convenient. Determine whether the encoded package contains an intentional audited correction/import. If not, return to the current approved governing program source and make the correction deliberately.

### Crownforge

Current governed release: **Crownforge Revised Integrated v2.1**.

Current app coverage:

- Crownforge Weeks 1–14 are owned by the modular Crownforge package.
- Crown Maintenance is a separate mandatory 3-week package/bridge.
- Source-specific regression and exercise-library audits protect the encoded program.

Workout execution may log performance and athlete state, but it must not rewrite Crownforge prescriptions.

### Black Crown

Current governed release: **Black Crown Revised v2.0**, 54 weeks.

Current app status:

- Black Crown has its own independent modular package boundary.
- The detailed 54-week prescription dataset is still catalog-only pending intentional structured import and audit.
- The approved human-readable Black Crown v2.0 source remains the programming authority for that future import.
- Historical Black Crown bibles, doctrine documents, prior versions, and alternate layouts are reference material only unless explicitly promoted through an audited source decision.

Do not infer Black Crown prescriptions from Crownforge.

## 3. Exercise Intelligence

Exercise Intelligence is separate from program programming.

A canonical exercise record may contain movement pattern, equipment, purpose, muscles, coaching cues, common mistakes, substitutions, demonstration links, and other exercise-level metadata. Program packages reference exercises; the exercise library does not change sets, reps, loads, weekly structure, or phase logic.

Substitutions must preserve the programmed movement's purpose, stimulus, equipment/skill constraints, and phase role. Matching a muscle group alone is not sufficient.

Older Crown System workbooks containing large exercise catalogs and demo/substitution data are valuable reference sources, but they do not automatically supersede the current audited app exercise library.

## 4. Exercise artwork

There are two intentional artwork conventions:

- Public repository drop-in artwork: `<exercise-slug>.webp` (or another supported image extension).
- Approved private JP artwork: `jp-<exercise-slug>-v2`, resolved through the governed private-art/Cloudinary mapping layer.

The `jp-...-v2` filenames are intentional and must not be bulk-renamed just to match the public drop-in convention.

Artwork is presentation data. It must not become a source for program logic or private athlete profile data.

## 5. Training Program Intelligence Database

The Training Program Intelligence Database is a research, comparison, and decision-support system. It may reveal better methods and justify intentional program revisions, but it does not automatically rewrite Crownforge or Black Crown.

Known lineage:

1. Stage 1 inventory.
2. Stage 2 extraction, culminating in the completed authoritative Stage 2 v0.90 handoff.
3. Stage 3 comparative intelligence, culminating in Stage 3 v0.96 FINAL.
4. Stage 4A–4I, culminating in Stage4I v1.06 FINAL REGRESSION AUDIT.
5. Later Crown Training Intelligence System layers built downstream of Stage4I.

Stage4I is the known factual master for that lineage and its established IDs must remain authoritative when the original master is recovered.

The original Stage 2 v0.90, Stage 3 v0.96 FINAL, and Stage4I v1.06 final binaries are currently missing from the accessible stores. Their completed status and lineage are known, but no recreated workbook should be mislabeled as one of those originals. Recover originals when possible; otherwise clearly label any reconstruction as a reconstruction.

## 6. Private athlete data

Athlete-specific data is private and separate from public application source. This includes, at minimum:

- profile and identity data
- training maxes
- bodyweight
- goals and development priorities
- program progress
- workout history
- readiness data
- PRs
- notes and preferences
- private cloud/auth records

Local-first storage is supported. Authenticated cloud synchronization may extend it, but public program/app code must remain usable without embedding one athlete's private data.

## 7. Historical material

Historical program documents, old source ZIPs, prior artwork styles, previous workbook editions, rebuild notes, and deprecated app artifacts are preserved for provenance and recovery.

They are **reference/archive material**, not silent competitors to the current source of truth.

## 8. Conflict-resolution order

When two sources disagree, resolve the conflict in this order:

1. Safety and data-privacy boundaries.
2. Current audited application/program package behavior.
3. Current approved governing human-readable program source.
4. Current exercise-intelligence source/audit for exercise-level facts.
5. Current project/build documentation.
6. Training Intelligence evidence used for intentional future revisions.
7. Historical/archived material.

An older source may still prove that a regression occurred. If it does, fix the current source intentionally and audit the correction; do not silently switch the runtime to an archived file.

## 9. Change discipline

Every meaningful change should preserve these rules:

- No random program changes for variety.
- No hidden prescriptions outside program packages.
- No private athlete data in the public repository.
- No destructive historical cleanup when archiving is sufficient.
- No claim that an unrecovered binary is an original.
- No build-path reorganization without first updating and validating the reconstruction pipeline.
- No release should be treated as canonical after a failed relevant audit.
