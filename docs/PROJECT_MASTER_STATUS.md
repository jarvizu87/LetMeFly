# LetMeFly Project Master Status

Last audited: **2026-09-07 (America/Phoenix)**

Purpose: one project-wide checklist for what is actually live, what is built but not live, what is still in progress, and what is intentionally paused/deferred. This document tracks product status only; program prescriptions remain governed by their own audited program packages.

## Status legend

- **LIVE** — shipped in the current production application/build path.
- **LIVE / PARTIAL** — usable in production, but a known content/catalog/coverage pass is still incomplete.
- **BUILT / NOT LIVE** — implemented or staged outside the current production release.
- **IN PROGRESS** — active work remains before release.
- **PAUSED** — intentionally held; do not integrate until explicitly resumed.
- **DEFERRED** — intentionally outside the current app scope.
- **RESEARCH / REFERENCE** — project intelligence or source material, not a user-facing production feature.

---

## 1. Core application and data

| System | Status | Notes |
| --- | --- | --- |
| Mobile-first LetMeFly PWA / Command V2 shell | **LIVE** | Current production surface. |
| Local-first workout storage / IndexedDB | **LIVE** | Workout logging remains usable locally. |
| Supabase/private-cloud architecture | **LIVE / PARTIAL** | Auth/cloud infrastructure exists, but cloud/account experience should continue to be treated as a separate hardening lane rather than assumed complete. |
| Safe Refresh utility | **LIVE** | Designed to update the shell without intentionally clearing athlete/workout data. |
| PWA install/update helpers | **LIVE** | Current production build includes PWA runtime helpers. |
| Android shell / TWA project | **BUILT / NOT PRIMARY LIVE SURFACE** | Repository contains Android shell/TWA build/test infrastructure; the production experience remains the web/PWA app unless explicitly promoted. |

## 2. Programs and progression

| System | Status | Notes |
| --- | --- | --- |
| Crownforge Revised Integrated v2.1, Weeks 1–14 | **LIVE** | Governed modular package; prescriptions protected by audits. |
| Crown Maintenance, 3-week bridge | **LIVE** | Separate mandatory bridge package. |
| Black Crown Revised v2.0, 54 weeks | **LIVE** | Governed Black Crown package/runtime/UI exists with 54 weeks / 270 sessions and entry/preview behavior. Older docs that still call it catalog-only are stale and need reconciliation. |
| Athlete program progression runtime | **LIVE** | Active program position, governed handoffs, and TM resolution; this is not the XP/quest gamification system. |
| Book-informed program delta candidates | **BUILT / NOT LIVE** | Work is isolated on the `book-informed-program-delta-candidates` branch and must not alter production until deliberately reviewed/promoted. |

## 3. Workout execution UI

| System | Status | Notes |
| --- | --- | --- |
| Single-active-set workout UI | **LIVE** | One active set at a time with readable controls. |
| Straight-set flow | **LIVE** | Includes set tabs, completion states, reopen/review behavior. |
| Superset / tri-set / giant-set flow support | **LIVE** | Shared connected-flow model; appears when programming defines the structure. |
| Circuit flow | **LIVE** | Connected rail, active/up-next/completed states, between-round rest handling. |
| Pyramid flow | **LIVE** | Build Up, Build Down, Up + Down/custom support; 10+ set handling and Pyramid Plan included. |
| 10–12+ set horizontal tab handling | **LIVE** | Tabs scroll instead of shrinking into unusable controls. |
| Small-phone / Galaxy layout hardening | **LIVE** | Includes narrow-width handling and long-name safeguards. |
| Missing load/RPE display hardening | **LIVE** | Blank/unprescribed values are handled intentionally. |
| Uneven circuit-set handling | **LIVE** | Supports groups where one movement has more work sets than others. |
| Readiness intake + persistence | **LIVE** | Sleep, Energy, Soreness, Stress selections persist. |

## 4. Exercise tools and coaching support

| System | Status | Notes |
| --- | --- | --- |
| Exercise Intelligence runtime | **LIVE** | Read-only descriptive layer for purpose, roles, equipment, muscles, cues, mistakes, substitutions, and demo link where available. |
| Exercise substitution safeguards | **LIVE / PARTIAL** | Governed substitution logic exists; only validated role-preserving substitutions should be promoted. |
| Smart exercise-name abbreviations | **LIVE** | Includes `Incline DB Press → Inc DB Press` and `1/2 Kneeling Chop → Half-Kneeling Chop`; canonical exercise identities remain unchanged. |
| Bar Loader in More | **LIVE** | Standalone bar loading calculator. |
| Contextual BAR LOAD from barbell exercise | **LIVE** | Prefills the active set load without changing the programmed prescription. |
| Iron Plates / Bumper Plates / Custom inventory | **LIVE** | Device-local plate inventory presets. |
| lb/kg bar presets, collars, exact/nearest load, copy result | **LIVE** | Includes mirrored bar rendering and small-phone support. |
| Voice-note dictation v2 | **LIVE** | Current production build installs v2. |

## 5. Exercise artwork and video

| System | Status | Notes |
| --- | --- | --- |
| Approved JP / Style 2 Cloudinary art resolver | **LIVE** | Runtime art mapping is active; no Android JSON import is required. |
| Crownforge exercise-art coverage | **LIVE** | Current Crownforge exercise names resolve through the approved art layer. |
| Future Black Crown/new exercise artwork production | **IN PROGRESS** | Asset creation/coverage can continue without blocking the core app. |
| Exercise-video system | **LIVE / PARTIAL** | Broken legacy Vimeo paths were removed/demoted and safe YouTube-search fallbacks are active. |
| Fully vetted direct-video catalog | **IN PROGRESS** | Direct links are still being curated; fallback search remains the safe default where a direct demo has not been approved. |

## 6. Progress and athlete tracking

| System | Status | Notes |
| --- | --- | --- |
| Strength Maxes | **LIVE** | Dedicated Strength Max management/runtime is installed. |
| Progress Dashboard v3 | **LIVE** | Production build includes current dashboard polish and private athlete-data integration. |
| Strength / Body / Conditioning / PR views | **LIVE** | Current Progress architecture. |
| Coach Insight / milestone presentation | **LIVE / PARTIAL** | Core UI is live; trend, milestone, empty-state, and metric quality can continue to improve. |
| Bodyweight, readiness, workout history, PR/e1RM inputs to Progress | **LIVE** | Uses authoritative athlete data sources rather than random browser inference. |

## 7. Gamification / Athlete XP and quests

**Status: PAUSED**

The XP, quest, rank/progression, reward, and related gamification concepts are intentionally **not to be integrated into production yet**.

Current rule:

> Keep the gamification design/rule work isolated. Do not add XP, quest, rank, reward, or gamified workout behavior to the live LetMeFly app until the user explicitly resumes this lane and the rules are finished.

This pause does **not** affect the existing athlete program-progression runtime used for Crownforge → Crown Maintenance → Black Crown handoffs.

## 8. Nutrition

**Status: DEFERRED**

Nutrition remains intentionally isolated from the current training/coaching product. Do not integrate it into the training engine until the user explicitly reopens that product lane.

## 9. Training Intelligence / research system

| System | Status | Notes |
| --- | --- | --- |
| Training Program Intelligence lineage/reconstruction work | **RESEARCH / REFERENCE** | Supports program analysis and future decisions; it does not automatically rewrite production programming. |
| Stage4I v1.06R4 reconstructed working master | **RESEARCH / REFERENCE** | Reconstruction, not an original recovered binary. |
| Crown Training Intelligence System control/index layers | **RESEARCH / REFERENCE** | Decision-support/control infrastructure. |
| Missing original Stage 2 / Stage 3 / Stage4I binaries | **CLOSED RECOVERY TARGETS UNLESS NEW EVIDENCE APPEARS** | Do not repeatedly rerun the same searches without materially new evidence. |

## 10. Known project cleanup / next checks

1. **Reconcile stale Black Crown documentation** — older README / source-of-truth wording still says catalog-only even though the current build path and finalization package install the governed 54-week runtime/UI.
2. **Continue direct-video curation** without breaking the safe fallback system.
3. **Continue remaining approved exercise-art production** as Black Crown/future programs expose additional needs.
4. **Continue Progress polish** for trend charts, PR-feed quality, conditioning metrics, milestone logic, and empty states.
5. **Keep book-informed program delta candidates off production** until reviewed and intentionally promoted.
6. **Keep gamification paused** until its XP/quest/rank rules are complete enough for a deliberate integration pass.
7. Re-run device QA after major production UI changes, especially on Galaxy/small-phone widths.

## Production release rule

A feature is only marked **LIVE** here when it is present in the governed production build path and the relevant build/audit has passed. A side-project design, branch, research workbook, mockup, or discussion does not count as live by itself.
