# Runtime v7 Stored Pilot Status Contract

## Authority

The immutable original completion-hook receipt is authoritative for whether progression ran at workout completion.

A finalized evidence packet cannot override that history.

## Blocking consistency failures

Stored pilot status blocks when:
- finalized evidence exists without an immutable original-hook receipt;
- receipt athlete identity disagrees with evidence athlete identity;
- receipt processing status disagrees with machine evidence;
- receipt first-awarded XP disagrees with machine evidence;
- receipt Yellow decision-coverage state disagrees with machine evidence.

## Pending review warning

A receipt without a finalized evidence packet is a warning, not a failure. It means a real workout occurred and the original progression hook was observed, but independent human review has not been finalized yet.

## One-call evaluator

`progressionShadowEvaluateStoredPilot(athleteId, options)` loads receipts, evidence packets and the current environment review, reconciles receipt-sensitive fields, and runs the existing three-workout visible-pilot gate.

This evaluator is read-only and cannot award XP or modify training.
