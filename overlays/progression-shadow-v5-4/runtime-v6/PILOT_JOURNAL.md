# Runtime v6 Pilot Journal Contract

## Original completion-hook receipt

The first Shadow completion hook for a programRunId + workoutId records an immutable receipt containing:
- processing success;
- first awarded workout XP;
- readiness;
- decision-gap coverage;
- Main Quest status when available;
- warnings and timestamp.

Receipt storage is add-once. A later duplicate replay cannot replace the original evidence with its 0-XP result.

## Gate requirement

A reviewed workout is blocked from the visible pilot if:
- no original hook receipt exists; or
- the original hook receipt says progression did not process successfully.

This catches the case where QA replay repairs a missed original hook.

## Private persistence

Pilot receipts, human reviews, and evidence packets are kept in:

`letmefly.progression.shadow.pilot.v1`

There is no localStorage fallback.

## Failure boundary

Pilot-journal failure is QA-only and remains fail-open. It cannot block or roll back workout logging or change training prescriptions.
