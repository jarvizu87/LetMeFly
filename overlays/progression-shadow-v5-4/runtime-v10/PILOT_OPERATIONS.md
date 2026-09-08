# Runtime v10 Pilot Operations

Runtime v10 adds read-only helpers for the real Shadow pilot.

`progressionShadowPilotReviewBacklog(athleteId)` reports pending human reviews, disqualified samples, active reviewed samples, Green/Yellow/RED coverage, and replacement reviews still needed.

`progressionShadowExportPilotAuditJournal(athleteId)` exports immutable pilot receipts, finalized evidence, dispositions, and backlog metadata with schema `lmf.progression.shadow.audit-export.v1` and a SHA-256 content digest.

The QA export contains progression-pilot evidence only. It does not export the canonical LetMeFly private athlete/workout database.
