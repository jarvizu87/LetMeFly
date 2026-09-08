# LetMeFly V5.4 Progression Shadow Runtime v4 Overlay

Runtime v4 turns the Shadow pilot checklist into a deterministic, read-only release gate.

It does not expose progression UI and does not change training.

The gate requires:
- 3 unique reviewed Shadow workouts;
- exact human-reviewed XP match on every reviewed workout;
- replay awards 0 XP;
- Main Quest COMPLETE;
- reload persistence;
- at least one Green review;
- at least one Yellow review with clean decision coverage;
- clean diagnostics, 0 pending commands, 0 dead letters;
- backup/restore + offline persistence smoke PASS;
- canonical workout logging regression PASS.

A real RED review remains a warning for the first visible pilot and a required broad-rollout safety review.

Validation: progression Shadow audit PASS, source/security PASS, Crownforge Weeks 1-6 regression PASS, Exercise Intelligence PASS, strict TypeScript audit with the V5.4 narrow Supabase declaration PASS.
