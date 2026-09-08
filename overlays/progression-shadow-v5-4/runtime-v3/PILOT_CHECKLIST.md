# LetMeFly Progression Shadow Pilot Checklist — V5.4

Status: internal QA only. Visible XP/Quest UI remains disabled.

## Pilot goal

Prove that real LetMeFly workout data can drive progression safely without changing, delaying, or rewriting training.

## Entry gates

Before the first real Shadow pilot session:

- V5.4 source/security audit PASS.
- Crownforge regression PASS.
- Exercise Intelligence audit PASS.
- strict TypeScript audit PASS.
- `npm run audit:progression-shadow` PASS.
- progression branch remains isolated from the active UI/runtime lane.
- no visible progression UI is enabled.
- Shadow persistence remains `letmefly.progression.shadow.v1` IndexedDB.

## First three real workouts

For each of the first three completed workouts:

1. Complete and persist the canonical LMF workout first.
2. Confirm progression runs afterward and is fail-open.
3. Record the Shadow completion result.
4. Confirm pending queue = 0 after replay.
5. Confirm dead letters = 0.
6. Confirm mapping compatibility PASS.
7. Confirm the same completed workout replays for 0 new XP.
8. Compare the ledger total with a human-reviewed XP calculation.
9. Confirm the Main Quest projection matches the completed workout and did not create a duplicate workout record.
10. Reload/reopen the app and confirm the Shadow ledger persists.

## Readiness coverage

### Green

At least one clean Green session must pass before visible pilot review.

### Yellow

Visible progression must remain blocked until a real Yellow case is reviewed.

For Yellow:

- every reduced MANDATORY exercise must have an explicit effective-prescription decision if the completed units are below the source target;
- every source-CONDITIONAL exercise must have an explicit active/inactive decision for visible rollout;
- source-OPTIONAL work may be cut automatically and is never required for core adherence;
- no decision means Shadow processing remains conservative and the session receives a decision-gap flag;
- readiness alone must never invent the reduced target.

### Red

A naturally occurring RED/safety case does not need to be manufactured for the first three workouts, but before broad rollout the RED fixture and at least one controlled real-world safety handling review must confirm:

- no phantom XP for unperformed work;
- no full-session bonus;
- support activation cannot override RED;
- canonical workout/safety history remains authoritative.

## Visible-pilot gate

Do not expose Quest/Progress rewards until all are true:

- at least 3 real completed Shadow workouts;
- 0 duplicate XP awards;
- 0 dead letters;
- 0 unresolved mapping errors;
- exact human-reviewed XP comparison on all pilot workouts;
- at least one real Green session validated;
- at least one real Yellow session validated with `decisionCoverageClean = true`;
- backup/export/restore smoke PASS for Shadow data;
- app reload/offline persistence smoke PASS;
- no regression in canonical workout logging;
- active UI lane is ready to consume the progression views intentionally.

## Rollback rule

If any pilot check fails, leave progression in Shadow Mode. Do not modify Crownforge/Black Crown, do not rewrite workout history, and do not compensate by manually editing XP. Fix the mapping or decision record and replay idempotently.
