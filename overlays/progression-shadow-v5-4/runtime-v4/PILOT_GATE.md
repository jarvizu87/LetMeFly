# LetMeFly Progression Shadow Pilot Gate — Runtime v4

Status: internal QA only. No progression UI is enabled.

Runtime v4 turns the pilot checklist into a deterministic gate.

`evaluateShadowPilotGate()` requires, before a visible pilot:

- at least 3 unique reviewed real Shadow workouts;
- every reviewed workout processed successfully;
- mapping compatibility PASS for every reviewed workout;
- exact human-reviewed XP match for every reviewed workout;
- replay of every reviewed workout awards 0 new XP;
- Main Quest status COMPLETE for every reviewed workout;
- Shadow data persists across reload;
- no unresolved readiness value;
- at least one reviewed Green session;
- at least one reviewed Yellow session with clean effective-prescription decision coverage;
- Shadow diagnostic health clean;
- 0 pending commands;
- 0 dead letters;
- backup/export/restore smoke PASS;
- offline/reload persistence smoke PASS;
- canonical workout logging regression PASS.

A real RED session is not required for the first visible pilot, because manufacturing a RED state would be poor training behavior. Missing RED coverage is therefore a warning, not a visible-pilot blocker. Broad rollout still requires a controlled real-world RED safety review.

The gate is read-only. It cannot modify training, readiness, XP, quests, or workout history.
