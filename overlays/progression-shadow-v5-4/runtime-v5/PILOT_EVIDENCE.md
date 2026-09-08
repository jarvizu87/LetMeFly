# Runtime v5 Pilot Evidence Contract

## Machine evidence

For each already-completed real workout, capture:
- athlete/workout/program-run identity;
- readiness color;
- mapping compatibility;
- Yellow decision coverage;
- actual workout XP from the Shadow ledger;
- Main Quest status;
- warnings;
- a deliberate replay result.

A healthy deliberate replay must award 0 new XP. A missed original hook can be repaired by replay, but the non-zero replay amount blocks the pilot gate and reveals the defect.

## Human review

The human-reviewed expected XP remains independent from the engine calculation being tested.

Required:
- expected workout XP;
- actual reload persistence confirmation;
- review timestamp.

The once-per-day readiness reward is excluded from the workout XP comparison.

## Environment preflight

Runtime v5 automates:
- diagnostic health;
- pending/dead-letter queue counts;
- export -> clean in-memory restore parity;
- second IndexedDB connection parity.

A second connection is only a preflight. The real pilot still requires an actual browser/app reload.

## Visible pilot remains blocked until

The runtime-v4 gate still applies: at least 3 reviewed real workouts, including one Green and one Yellow with clean decision coverage, exact XP match, 0-XP replay, COMPLETE Main Quest, reload persistence, clean diagnostics, zero queue issues, backup/restore PASS, offline persistence PASS, and canonical workout logging regression PASS.

## Current boundary

Runtime v5 removes manual evidence-assembly work, but it does not fabricate real pilot evidence. The next gate still requires actual completed LetMeFly workouts. Progression remains invisible until those reviews pass.
