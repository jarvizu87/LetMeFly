# Progression Shadow — current-main port

## Purpose

Port the hidden Progression Shadow pilot onto the current LetMeFly production reconstruction without giving it authority over training, program state, canonical athlete data, sync, or visible UI.

Historical Progression Shadow branches remain reference material only. This current-main lane is rebuilt against the production release base and must preserve Crownforge, Crown Maintenance, Black Crown, canonical workout history, and the existing authoritative program-progression service.

## Stage 1 — safe completion boundary

GREEN.

- canonical workout completion persists first
- Shadow observes only after persistence
- existing authoritative program progression still owns program movement
- Shadow exceptions fail open and cannot block completion/progression
- no UI, network, canonical-data mutation, or auto-apply

## Stage 2 — pure Green / Yellow / Red review engine

GREEN.

- Green uses governed source targets
- Yellow reductions require explicit effective-prescription decisions
- missing Yellow decisions create machine-readable gaps and block the pilot sample
- RED retains safety authority and never rewrites governed mandatory targets from actual work
- optional work cannot become core adherence
- pilot evidence cannot auto-apply training changes
- evidence gate requires at least three unique real healthy reviews, including Green and Yellow coverage

## Stage 3 — read-only canonical-data adapter

GREEN.

- reads only the exact completed session and its linked readiness, exercises, sets, and coaching decisions
- never substitutes later/latest readiness for historical readiness
- programmed identity comes from the immutable prescription snapshot
- completed work comes from completed canonical set rows only
- substitutions preserve programmed source identity for adherence review
- future, inactive, foreign, malformed, or wrong-type Yellow decisions cannot silently alter targets

## Stage 4 — append-only original-hook journal

GREEN.

Isolated IndexedDB: `letmefly.progression.shadow.pilot.v1`.

- derived QA evidence only
- original-hook receipts are add-only
- deterministic SHA-256 evidence digest
- identical replay returns the original record
- changed replay evidence fails closed
- reload persistence proven
- no canonical DB, sync, Supabase, UI, governed-program, or Crownstorm dependency

## Stage 5 — immutable provenance + finalized human review

GREEN.

Isolated review ledger: `letmefly.progression.shadow.pilot.review.v1`.

- provenance binds the immutable Stage-4 receipt to the exact mapped review
- forged receipts and changed mapped evidence fail closed
- human review is explicit, add-once, digest-bound, and immutable
- human agreement cannot hide technical or decision-coverage failure
- rebuilt pilot status comes from receipt + provenance + human evidence
- evidence alone cannot authorize visibility
- auto-apply remains locked false

## Stage 6 — pilot operations hardening

GREEN.

Isolated operations ledger: `letmefly.progression.shadow.pilot.operations.v1`.

- dispositions are append-only and limited to genuine human-review mistakes
- dispositions cannot hide processing, technical, provenance, decision-coverage, or eligibility failures
- quarantined evidence is never rewritten
- replacement must be a different workout that independently passes Stage-5 human-accepted evidence
- replacement linkage is immutable and digest-bound
- backlog reports pending reviews, quarantined samples, active accepted samples, Green/Yellow/RED coverage, minimum remaining reviews, and unresolved replacements
- evidence gate requires three active accepted reviews, Green coverage, Yellow coverage, and zero unresolved replacement links
- audit export contains derived pilot evidence only and carries a deterministic SHA-256 digest
- independent verification detects export tampering
- visibility and auto-apply remain locked false at the evidence-only gate

## Stage 7 — verified restore + explicit operator authorization

GREEN end-to-end on the exact current production reconstruction.

Isolated restore/authorization ledger: `letmefly.progression.shadow.pilot.restore.v1`.

Stage 7 adds a fail-closed operational handoff:

- audit-package schema must exactly match `lmf.progression.shadow.audit-export.current.v1`
- outer SHA-256 content digest is recomputed before restore
- every restored row must belong to the package athlete
- duplicate receipt/provenance/human-review/disposition/replacement identities fail closed
- backlog is independently rebuilt from receipts, provenance, human reviews, dispositions, and replacement links
- a package whose backlog was semantically altered is rejected even if an attacker recomputes a new valid outer digest
- cross-athlete evidence injection is rejected
- verified packages restore only into isolated QA storage
- identical restore replay returns the immutable original restore record

Visible-pilot authorization is a separate add-once record and cannot be inferred from evidence:

- verified restored evidence is required first
- the rebuilt evidence gate must be satisfied
- operator intent must explicitly equal `AUTHORIZE_VISIBLE_PILOT`
- the operator must explicitly confirm genuine real-pilot evidence
- authorization is digest-bound to the verified restore record
- identical authorization replay returns the immutable original record
- a changed finalized authorization cannot overwrite history
- passing evidence without an operator authorization leaves visibility false
- an operator cannot authorize an unsatisfied evidence gate
- `autoApplyAllowed` remains hard-locked false even after visible-pilot authorization

Stage 7 passed schema/digest verification, semantic-tamper rejection, cross-athlete rejection, export → restore → rebuild equivalence, restore replay, evidence-only visibility lock, gate-bypass rejection, explicit operator authorization, authorization replay/conflict checks, reload persistence, TypeScript typecheck, candidate build, Crownstorm absence, privileged-secret guards, Command V2, and the exhaustive Seven-Athlete release audit.

## Next phase — hidden real-workout pilot integration

Synthetic engineering gates are complete enough to stop inventing more pilot mechanics. The next meaningful work is to prepare the hidden Shadow runtime for intentional integration/release so genuine completed workouts can produce evidence.

That phase must preserve these locks:

- no visible Crownstorm/gamification
- no automatic progression UI activation
- no auto-apply
- no program/TM/readiness/profile/history rewrites
- no operator authorization until genuine real-workout evidence satisfies the pilot gate
- real RED evidence is not manufactured for QA

The production release remains a separate explicit decision and must follow the normal gated Netlify release workflow.

## Hard boundaries

Progression Shadow must not:

- rewrite canonical athlete/workout/program data
- become a second training authority
- modify Crownforge, Crown Maintenance, or Black Crown prescriptions
- alter TMs, readiness, profile, workout history, sync state, or program position
- call Supabase or other network services from the Shadow lane
- auto-apply recommendations
- expose Crownstorm/gamification prematurely
- block canonical workout completion or authoritative program progression

The existing `program-progression-service.ts` remains authoritative for Crownforge → Crown Maintenance → Black Crown movement.

## Real-world pilot acceptance

CI green is not real-world pilot acceptance. At least three counted genuine completed-workout reviews are required, including one Green and one Yellow with clean decision coverage and matching original-hook provenance. A quarantined human-entry mistake requires a different accepted replacement workout instead of rewritten history.

A real RED case is not manufactured for QA.

## Production status

This branch remains draft-only. No `[release netlify]` marker is present. Nothing in Stages 1–7 by itself authorizes a production publish, visible progression, Crownstorm, or auto-application.