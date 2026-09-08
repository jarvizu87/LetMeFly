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

The current Drive-side Exercise Intelligence authority is **LetMeFly Exercise Intelligence Master v2 — ROLE ENRICHED**. It is derived first from the exact 92-entry exercise registry shipped by the latest successful LetMeFly production build, then selectively enriched only where existing Crown sources provide source-backed role/purpose evidence.

Current v2 state:

- 92 canonical shipped exercise records; no duplicate production exercise IDs or canonical names.
- 86 are linked to Crownforge and 65 to Black Crown in the current app registry.
- 91 of 92 app exercise IDs map directly to the current Active Plan thumbnail index; `elliptical` versus `elliptical-trainer` remains an explicit crosswalk exception rather than a silent rename.
- 31 exercises currently have source-backed movement-role / purpose taxonomy; 61 remain explicitly unenriched.
- 9 source-backed role families are currently defined: Squat Pattern, Bench / Press Pattern, Hinge / Pull Pattern, Upper-Back Pull Pattern, Knee Support Pattern, Back-Extension Role, Olympic / Power Pattern, Kettlebell Pattern, and Yoke / Trap Pattern.
- Rich fields that are not yet supported by validated evidence remain blank/queued rather than guessed, including muscle maps, detailed coaching cues, common mistakes, and many direct instructional-video replacements.
- Older Crown System workbooks remain reference sources. Their 202 active-plan exercise/demo records and 68 historical substitution pairs are not imported wholesale into current canon.
- Historical substitutions must be revalidated against current role-preservation rules before promotion. For example, a hamstring curl may preserve a knee-flexion hamstring role but does not automatically preserve the loaded-hinge / lengthened posterior-chain role of an RDL.

A canonical exercise record may contain movement pattern, equipment, purpose, muscles, coaching cues, common mistakes, substitutions, demonstration links, and other exercise-level metadata. Program packages reference exercises; the exercise library does not change sets, reps, loads, weekly structure, or phase logic.

Substitutions must preserve the programmed movement's purpose, stimulus, equipment/skill constraints, fatigue role, and phase role. Matching a muscle group alone is not sufficient. **Role beats name; replace the exercise, not the training purpose.** If a substitute uses a different loading authority or parent lift, its load must be recalculated from the correct source rather than copying the original exercise's load blindly.

Exercise Intelligence version history is preserved under its own Version Archive; superseded masters are retained for provenance rather than deleted.

## 4. Exercise artwork

There are two intentional artwork conventions:

- Public repository drop-in artwork: `<exercise-slug>.webp` (or another supported image extension).
- Approved private JP artwork: `jp-<exercise-slug>-v2`, resolved through the governed private-art/Cloudinary mapping layer.

The `jp-...-v2` filenames are intentional and must not be bulk-renamed just to match the public drop-in convention. Some historical thumbnail-registry notes still reference `jp-...-v1.png`; those are alignment/audit flags, not automatic rename instructions.

Artwork is presentation data. It must not become a source for program logic or private athlete profile data.

## 5. Training Program Intelligence Database

The Training Program Intelligence Database is a research, comparison, and decision-support system. It may reveal better methods and justify intentional program revisions, but it does not automatically rewrite Crownforge or Black Crown.

Known historical lineage:

1. Stage 1 inventory.
2. Stage 2 extraction, culminating in the completed authoritative Stage 2 v0.90 handoff.
3. Stage 3 comparative intelligence, culminating in Stage 3 v0.96 FINAL.
4. Stage 4A–4I, culminating in Stage4I v1.06 FINAL REGRESSION AUDIT.
5. Later Crown Training Intelligence System v1.9 layers built downstream of Stage4I.

### Current recovered authority

The original Stage 2 v0.90, Stage 3 v0.96 FINAL, and Stage4I v1.06 FINAL REGRESSION AUDIT binaries remain missing from the currently accessible stores. Their completed status and lineage are proven by surviving handoff material and downstream intelligence, but reconstructions must never be relabeled as originals.

The current recovered working master is:

- **Stage4I v1.06R4 — RECONSTRUCTED MASTER**.
- It preserves the surviving Stage4I control metrics, the complete 51-row comparative-score backfill available downstream, the source-recovered Stage-3 settled decision architecture, the locked Stage-4 operational architecture preserved in the Stage-5 handoff, known exact IDs such as `GR-01.1`, and the exact recovered design-regression result: 270/270 sessions audited, 270/270 primary prescriptions exact-match, and zero listed design-regression failures.
- Its reconstruction IDs remain distinct from original IDs that have not been recovered.
- The original Stage-3 Keep/Change/Cut count of 34 decisions is preserved as a factual count, but the original one-to-one 34-row identity is not claimed as recovered.
- The Stage4B counts of 32 LOCKED, 2 TEST, and 3 CONDITIONAL rules are preserved as factual counts, but the complete original 37-row ID/status mapping is not claimed as recovered.

The current downstream control/index layer is:

- **Crown Training Intelligence System v1.9R3 — RECONSTRUCTED CONTROL INDEX**.
- It preserves the observed 11-layer engine architecture, downstream module roles, the visible `DR-001` through `DR-020` Prescription Response Matrix, Crown Coach decision-routing logic, governance boundaries, and recovered QA signals.
- R3 is synchronized to Stage4I R4 and the current Drive-side lineage index.
- It is a downstream control/schema/intelligence layer only. It must not renumber, replace, or silently override Stage4I factual IDs and registries.

The current Drive-side lineage/provenance map is **LetMeFly Training Intelligence Lineage Index v5**. It records which Training Intelligence artifacts are recovered originals, reconstructions, current, historical, File-Library-only, or superseded. Superseded reconstructions remain archived as provenance checkpoints rather than being deleted.

The **Training Intelligence Recovery Closure Register v1** records the missing-original search paths that have already been exhausted. Reopen a closed recovery target only when materially new evidence appears—for example an exact binary/file object, a new file or revision ID, a complete original row dump, or another independently surviving artifact that exposes exact original IDs. Re-running the same Drive/File-Library searches with different wording is not new evidence.

If an original missing binary is recovered later, compare it against the current reconstruction by IDs, source facts, governance rules, and regression results before promoting it. Do not silently overwrite the recovered lineage.

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
4. Current Exercise Intelligence master and its validated source evidence for exercise-level facts.
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
- No bulk promotion of historical exercise/substitution data without current role/evidence validation.
- No build-path reorganization without first updating and validating the reconstruction pipeline.
- No release should be treated as canonical after a failed relevant audit.
