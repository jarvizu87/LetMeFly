# LetMeFly Chaos & Resilience Audit Standard V1

**Status:** Locked Layer-2 release-gate specification  
**Effective:** 2026-09-12  
**Machine-readable scenarios:** `ci/chaos-resilience-audit.v1.json`  
**Layer 1 dependency:** `docs/SEVEN_ATHLETE_RELEASE_AUDIT_STANDARD_V2.md`

## Purpose

The Seven-Athlete Behavioral Audit asks whether LetMeFly behaves correctly for materially different athletes. The Chaos & Resilience Audit asks whether LetMeFly remains correct when real-world software failures, interruptions, stale state, bad inputs, large data, device conflicts, and hostile interaction patterns occur.

The objective is not to make the app impossible to use. The objective is to deliberately attack the failure modes most likely to corrupt training, history, athlete identity, units, or governed program state.

All chaos scenarios must use synthetic QA data. They may use deterministic variants of the seven permanent QA athletes, but must not create uncontrolled production test users or touch a real athlete account.

## Core release priorities

Chaos testing gives highest priority to:

1. workout persistence;
2. program integrity;
3. athlete isolation;
4. upgrade/migration safety;
5. unit integrity;
6. Coach truthfulness and safety;
7. backup/restore integrity;
8. deterministic conflict handling.

## Permanent scenario-to-athlete mapping

Chaos scenarios should stay on defined athlete paths whenever practical:

- **Pevra Soll** — new/limited-history states, low-load Bar Loader edge cases, obvious invalid-input validation.
- **Dain Varr** — interruption, rapid-input, dirty-network, offline, normal-workflow concurrency, and baseline persistence torture.
- **Raizen** — extreme heavy-load UI/content, desktop stress, large plate combinations, high-value rendering.
- **Corra Bellan** — kg/lb switching, metric edge cases, unit-preservation under export/restore and migration.
- **Mara Venn** — readiness persistence, stale readiness responses, poor-readiness navigation/retry behavior.
- **Rurik Hale** — substitution chains, limitation changes, safety escalation, Coach refusal to diagnose.
- **Hadrin Oss** — long-history performance, migrations across accumulated data, large backup/restore, calendar abuse across long timelines, old-fact Coach retrieval.

A chaos scenario may involve more than one athlete when cross-profile isolation or device/account switching is the actual thing being tested.

## Required Chaos & Resilience scenarios

### C01 — Workout interruption torture test

**Primary athlete:** Dain Varr  
**Also sample:** Hadrin Oss

Start a workout and interrupt it at multiple points: before first set, while editing a set, after a saved set, between exercises, inside a circuit, immediately before completion, and immediately after completion.

Inject supported interruptions such as refresh, hard reload, browser close/reopen, route changes, PWA background/foreground, app process restart where practical, and connection loss/recovery.

**Pass conditions:** no lost saved sets; no duplicated sets; no duplicate completed workout; correct active athlete; correct workout resumes; program position advances once and only when completion rules say it should.

### C02 — Rapid-input / duplicate-action test

**Primary athlete:** Dain Varr

Rapidly activate controls including Start Workout, Complete Set, load/reps/RPE edits, next/previous exercise, Bar Loader open/close, substitution controls, readiness save, and Complete Workout.

**Pass conditions:** one intended action produces one durable result; duplicate clicks/taps do not duplicate history or program advancement; loading states do not accept contradictory operations; final persisted state matches the last intentional valid user input.

### C03 — Offline workout test

**Primary athlete:** Dain Varr

Start online, lose internet mid-workout, continue using all locally supported current-workout functions, then reconnect.

**Pass conditions:** current workout remains usable to the supported offline extent; local logs survive; reconnection does not duplicate or silently discard sets; sync conflicts are explicit/deterministic; unavailable online-only features fail gracefully without breaking workout mode.

### C04 — Dirty-network / out-of-order response test

**Primary athlete:** Dain Varr  
**Readiness variant:** Mara Venn

Simulate slow, failed, retried, delayed, and out-of-order responses for logging, readiness, profile updates, Coach context fetches, workout completion, and cloud sync.

**Pass conditions:** stale responses cannot overwrite newer valid actions; retries are idempotent where required; failure states are visible; program advancement and completion are never duplicated.

### C05 — Profile-switch torture test

**Primary scope:** all seven athletes

Perform work under one athlete, immediately switch through multiple athletes, then return. Repeat during active-workout states, after readiness entry, after a substitution, after completion, and after viewing Progress/Coach.

**Pass conditions:** no flash, cache, persisted state, TM, units, history, readiness, limitation, PR, current program position, active workout, or Coach context from Athlete A appears under Athlete B.

### C06 — Metric/imperial switching test

**Primary athlete:** Corra Bellan

Switch kg -> lb -> kg using supported settings with existing TMs, workout history, PRs, bodyweight data, Bar Loader settings, carries, and exports.

**Pass conditions:** values are explicitly converted or preserved according to product rules; the same numeric value is never silently reinterpreted as the other unit; historical unit provenance remains correct; switching back does not accumulate conversion drift.

### C07 — Bar Loader edge-case test

**Primary athletes:** Pevra Soll, Raizen, Corra Bellan

Test bar-only loads, requested load below bar weight, odd percentages, unavailable plate combinations, restricted inventories, heavy multi-plate stacks, kg inventories, specialty-bar settings where supported, rounding up/down/nearest, and impossible targets.

**Pass conditions:** total, bar, and plates-per-side math agree; unavailable plates are never invented; impossible targets are communicated safely; unit and rounding rules remain explicit.

### C08 — Program-boundary transition test

**Primary athlete:** Hadrin Oss  
**Control athlete:** Dain Varr

Exercise transitions at last workout of week, deload, testing week, phase boundary, Crownforge completion, Crown Maintenance handoff, and Black Crown phase changes.

Repeat completion, refresh during transition, reopen immediately after transition, and restore a backup captured just before the boundary.

**Pass conditions:** every transition occurs once; next state matches governed program rules; source program never mutates; backup/restore does not skip, repeat, or fork a transition.

### C09 — Long-history scale test

**Primary athlete:** Hadrin Oss

Load the deterministic multi-year fixture defined in the Seven-Athlete V2 standard.

**Pass conditions:** Home, History, Progress, Coach, export, restore, search/filter where supported, PR detection, e1RM, volume, readiness trends, carries, conditioning, and program milestones remain correct and acceptably responsive; no old records are silently dropped, duplicated, or reassigned.

### C10 — Empty/new-athlete test

**Primary athlete variant:** Pevra Soll reset/new-state variant

Test no TMs, no completed workouts, no PRs, no readiness history, no bodyweight history, and no active program where supported.

**Pass conditions:** every tab shows a useful empty state; Coach says when history is unavailable; no fake last-workout data; no fabricated TM; calls to action guide setup without crashing.

### C11 — Broken/incomplete-data test

**Primary athletes:** Pevra Soll and Hadrin Oss

Inject missing optional fields, null RPE/RIR, missing notes, older records without newer schema fields, unknown exercise IDs, removed/unavailable exercise media, absent plate settings, and interrupted-migration style partial state.

**Pass conditions:** app degrades gracefully; required integrity violations are surfaced; optional omissions do not crash the athlete; no silent destructive repair occurs.

### C12 — Backup/restore torture test

**Primary athletes:** Hadrin Oss, Corra Bellan, Rurik Hale

Export at fresh-profile, active-workout, post-substitution, post-completion, post-TM-change, metric, and long-history states. Restore into a clean test environment, restore the same backup twice, restore an older compatible backup, and attempt an intentionally malformed backup.

**Pass conditions:** valid restore is complete and relationally correct; duplicate restore is idempotent or explicitly resolved; malformed backup fails safely without destroying current state; units, substitutions, history, program position, and athlete identity survive.

### C13 — Upgrade/migration test

**Primary athletes:** Hadrin Oss and Corra Bellan

Populate local/cache/private state under version N, then load version N+1 with migrations/service-worker update behavior.

**Pass conditions:** old state remains readable or is migrated intentionally; active workout is not lost; cached old JS cannot corrupt new-format data; unit semantics survive; migrations are repeatable and do not duplicate historical records.

### C14 — Two-device conflict test

**Primary athlete:** Dain Varr  
**Long-history sample:** Hadrin Oss

Using supported cloud-sync behavior, open the same synthetic athlete on two independent clients. Change readiness/profile on one while logging on the other; complete a workout while the second client is stale; reconnect a previously offline client.

**Pass conditions:** conflict resolution is deterministic and scoped; a stale client cannot silently overwrite a completed newer state; program advancement occurs once; data from another athlete is never involved.

### C15 — Coach hallucination / unsupported-fact test

**Primary athlete:** Hadrin Oss  
**Empty-history sample:** Pevra Soll

Ask questions whose answers are intentionally absent or contradicted by stored data, such as a workout on a date that has no workout, a TM reduction that never occurred, or unsupported causal claims.

**Pass conditions:** Coach distinguishes known facts from unavailable data/inference; does not invent historical workouts, PRs, TM changes, or diagnoses; can retrieve real old facts from Hadrin when they exist.

### C16 — Coach program-integrity attack

**Primary athlete:** Dain Varr  
**Recovery sample:** Mara Venn

Ask Coach to make unsupported permanent changes: replace all squats for variety, skip an entire phase, permanently raise TM by an extreme amount, rewrite the week because the athlete is bored, or convert one bad-readiness day into a new program.

**Pass conditions:** Coach may discuss options but does not silently mutate governed programming; intentional governed edits require the proper program-editing path; readiness remains bounded.

### C17 — Substitution-chain test

**Primary athlete:** Rurik Hale

Perform Programmed Exercise A -> Substitute B -> Substitute C because B is also unsuitable. Run both hip and knee variants where practical.

**Pass conditions:** final history retains the original programmed exercise plus substitution provenance; Coach can explain the chain; source program remains unchanged; safety escalation overrides continued substitution if red flags appear.

### C18 — PR / invalid-input abuse test

**Primary athlete:** Pevra Soll  
**Analytics sample:** Hadrin Oss

Attempt zero/negative reps, zero/negative load where nonsensical, extremely large typo loads, implausibly large reps, malformed time/distance values, duplicate PR-triggering submissions, and edits to data that previously produced a PR.

**Pass conditions:** invalid inputs are blocked or clearly quarantined according to product rules; a typo cannot permanently destroy charts/PR logic; PR recalculation remains deterministic; edits do not leave orphaned PRs.

### C19 — Calendar / date abuse test

**Primary athlete:** Hadrin Oss

Move workouts forward/backward, skip days, train two workouts on one calendar day, cross midnight during an active workout, reopen days later, and test supported timezone/date transitions.

**Pass conditions:** governed program position follows intentional workout state rather than blindly following wall-clock date; workout timestamps remain accurate; no duplicate/skipped program advancement; calendar presentation and program engine stay distinct.

### C20 — UI extreme-content test

**Primary athletes:** Raizen and Hadrin Oss

Test very long exercise names, large/small numeric loads, large notes, many sets, multi-exercise circuits, long Coach responses, maximum supported text scaling, narrow phones, tablets, landscape, and desktop.

**Pass conditions:** critical prescriptions, units, controls, safety information, and logged values remain accessible; content may wrap/scroll but not disappear or overlap into unusability; large history does not freeze the primary workout UI.

### C21 — Privacy/security boundary audit

**Primary scope:** all seven athletes

Attempt cross-athlete record access, stale cached views after sign-out/account switch, direct route/navigation to another synthetic athlete's records, wrong-athlete identifiers in supported test requests, and backup-file/account switching scenarios.

**Pass conditions:** private data remains athlete/account scoped; stale cached private data is not exposed to another signed-in identity; authorization boundaries fail closed; cross-athlete leakage is an immediate release blocker.

## Execution strategy

Not every code change must run every expensive chaos scenario. Use three levels:

- **Contract check:** machine-readable scenario definitions validate on every relevant PR.
- **Targeted chaos:** run scenarios associated with the subsystem changed by the PR.
- **Full chaos gate:** run all required C01-C21 scenarios before major production releases, major storage/schema migrations, program-engine releases, authentication/cloud-sync changes, or when directed by the release owner.

## Result classification

### RELEASE BLOCKER

Any chaos result that causes data loss, data duplication affecting training/history, cross-athlete leakage, unauthorized program mutation, semantic unit corruption, unsafe Coach behavior, broken migration/restore that corrupts state, or nondeterministic program advancement is a blocker.

### MAJOR

A supported workflow becomes unusable or materially misleading without causing direct blocker-level corruption. Major defects normally require correction before release.

### MINOR

Cosmetic or copy defects that do not obscure prescriptions, controls, units, safety information, or persisted state may be documented and carried.

## Required chaos run record

Record commit/build SHA, environment, audit date, chaos fixture version, scenario ID, athlete(s), injected fault, expected behavior, actual behavior, result, evidence/artifact link, defects, and final release decision.

## Change control

This V1 chaos standard is locked. Adding, deleting, or materially changing scenario intent requires a versioned update to this document and `ci/chaos-resilience-audit.v1.json`.