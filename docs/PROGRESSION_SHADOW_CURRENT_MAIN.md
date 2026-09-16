# Progression Shadow — current-main port

## Purpose

Port the hidden Progression Shadow pilot onto the current LetMeFly production reconstruction without giving it any authority over training, program state, athlete data, sync, or UI.

The older Progression Shadow draft PRs remain historical source material only. They were built against an older September 8 reconstruction and must not be merged directly into current `main`.

## Stage 1 — safe completion-event boundary

Stage 1 installs a small observational module into the reconstructed app only during its dedicated audit workflow.

The completion hook is after canonical workout persistence and before the existing authoritative program progression call. It is fail-open: a Shadow exception cannot block workout completion or Crownforge → Crown Maintenance → Black Crown progression.

Stage 1 passed against the exact current production reconstruction.

## Stage 2 — pure evidence/review engine

Stage 2 ports the non-gamified Green / Yellow / Red evidence rules as a pure module.

Preserved rules from the historical Shadow pilot:

- Green uses the governed source prescription for core adherence.
- Yellow reductions are never inferred from incomplete work.
- Reduced mandatory Yellow work requires an explicit effective target.
- Source-conditional Yellow work requires an explicit active/inactive decision.
- Missing Yellow decisions create machine-readable gaps and block the sample from the real pilot.
- RED remains safety authority and deactivates conditional support work.
- RED actual work never rewrites the governed mandatory target.
- Oversized effective targets are capped at the governed source target.
- Source-optional work cannot be promoted into core adherence.
- Unknown readiness cannot infer conditional activation.
- No review can auto-apply a training change.

Stage 2 also carries the real-pilot gate as pure review logic:

- at least 3 unique real, technically healthy reviewed workouts
- at least 1 Green review
- at least 1 Yellow review with clean decision coverage
- duplicate workout samples fail closed
- technical failures cannot be hidden by later healthy samples
- synthetic fixtures cannot satisfy the real-workout count
- when a strength review is explicitly required, multiple qualifying sessions must span at least 21 elapsed days
- passing evidence still cannot automatically enable visible progression

Stage 2 passed its dedicated Green / Yellow / Red audit against the current production reconstruction.

## Stage 3 — current-data read-only adapter

Stage 3 is implemented and green.

It reads only the canonical records for the exact completed workout:

- `workoutSessions` by completed session ID
- the session-linked `readinessEntries` row via `workoutSessions.readiness_id`
- `workoutExercises` by exact session
- `workoutSets` by exact session
- `coachingDecisions` by exact session

It deliberately does **not** use `latestReadiness()`, so a later readiness check-in cannot rewrite the evidence for an older workout.

Programmed work identity comes from the immutable `prescription_snapshot`, including `prescribedExerciseKey`, source priority, and `sourceSets`. A performed substitution may change the performed exercise identity, but it does not rewrite the programmed source identity used for adherence review.

Completed work units are counted from completed canonical set rows only. Reps and load are not used as a proxy for completed sets. Extra logged sets stay outside the governed completion numerator; duplicate/malformed canonical set joins fail technical health closed.

Yellow effective-prescription handling stays explicit and historical-source compatible:

- decision type must be `effective_prescription_adjustment`
- decision status must be `active`
- it must belong to the same athlete and exact workout session
- it must link to the exact workout exercise
- its effective time must be at or before workout completion
- the latest valid decision wins
- future, inactive, deleted, foreign, malformed, or wrong-type records do not silently alter the target
- source-optional work still cannot become core adherence

Missing or invalid linked readiness becomes `unknown`; it is never replaced by a newer readiness record. Strength qualification remains deliberately `false` until a dedicated current-source classification rule is reviewed rather than inferred.

Stage 3 passed exact-current reconstruction, current data-contract inspection, read-only evidence mapping, substitution provenance, Green/Yellow fixtures, future/inactive decision rejection, extra/duplicate set cases, foreign/missing readiness/session cases, typecheck, candidate build, Crownstorm absence, and privileged-secret guards.

## Stage 4 — isolated append-only original-hook journal

Stage 4 is implemented and green.

It persists only derived Shadow pilot evidence in the isolated IndexedDB database `letmefly.progression.shadow.pilot.v1`. This is not canonical athlete/workout state.

Stage 4 guarantees:

- original-hook receipts are append-only via object-store `add`
- identical replay returns the immutable original receipt
- changed replay evidence fails closed instead of replacing history
- receipts carry deterministic SHA-256 evidence digests
- receipts survive module/app reload through isolated IndexedDB
- no canonical DB writes, cloud sync, network access, UI, governed-program dependency, or Crownstorm dependency
- journal failure stays inside the same fail-open post-completion Shadow boundary

Stage 4 passed persistence, replay, conflict, reload, typecheck, candidate-build, Crownstorm-absence, and privileged-secret guards.

## Stage 5 — immutable provenance + finalized human-review evidence

Stage 5 is implemented and green.

It adds a separate isolated pilot-review ledger at `letmefly.progression.shadow.pilot.review.v1`. The ledger stores only Shadow QA provenance and finalized human-review evidence; it does not become a second training database.

Original-hook provenance is captured only after the immutable Stage-4 receipt exists. Each provenance record binds:

- athlete/workout identity
- workout completion/readiness state
- the immutable Stage-4 original-receipt digest
- a SHA-256 digest of the exact mapped prescription/outcome review
- a deterministic provenance digest over those facts

Provenance is append-only and replay-safe. Identical replay returns the original record; changed mapped evidence or a forged/non-matching receipt fails closed.

Human review is deliberately **not** called by the workout-completion hook. A controlled reviewer must explicitly finalize it later. The finalized review is add-once, digest-bound to the original receipt and provenance, and cannot be edited in place. An identical replay returns the original review; different later evidence is rejected instead of overwriting history.

The Stage-5 rebuilt pilot-review status is reconstructed from receipt + provenance + human evidence rather than trusting a cached final flag. Even a matching human `agree` cannot:

- suppress a technical failure
- promote a decision-coverage failure
- authorize visible progression
- enable auto-apply
- mutate the workout or governed prescription

`visibilityAuthorized` and `autoApplyAllowed` remain hard-locked false in this stage.

Stage 5 passed:

- exact-current production reconstruction
- provenance append-only/replay checks
- forged-receipt rejection
- changed-mapping conflict rejection
- finalized human-review add-once/replay checks
- changed finalized-review overwrite rejection
- rebuild from machine + human evidence
- technical-failure cannot be hidden by human agreement
- reload persistence
- proof that human review never mutates the Stage-4 original receipt
- TypeScript typecheck
- production candidate build
- Crownstorm absence guard
- privileged-secret absence guard

## Next stage — pilot operations hardening

The next current-main layer should port only the non-gamified runtime-v10 operational controls needed for the real pilot:

- append-only review dispositions for genuine human-review mistakes
- replacement-workout policy instead of rewriting immutable evidence
- pilot backlog/coverage reporting
- tamper-evident pilot audit export

A disposition must never suppress technical failure. Export/restore and explicit operator authorization remain separate gates before any visible progression surface.

Historical runtime-v6 through runtime-v10 remain reference material only; they are not merged directly.

## Hard boundaries

Progression Shadow must not:

- write canonical LetMeFly athlete/workout/program data
- call Supabase or other network services from the Shadow lane
- mutate the active program instance or governed program definitions
- change training maxes, workout history, readiness, profile, or sync state
- render UI, show toasts, or change navigation
- auto-apply a recommendation
- import or activate Crownstorm/gamification
- block workout completion or authoritative progression if Shadow throws

The authoritative `program-progression-service.ts` remains the only current owner of Crownforge → Crown Maintenance → Black Crown progression.

## Real-world pilot acceptance

The pilot is **not accepted** merely because CI is green. Real-workout evidence is still required. Historical runtime-v10 acceptance intent remains the reference for later operational hardening, including immutable receipts/provenance, replay/idempotency, human review, disposition/replacement handling, export/restore, and explicit operator authorization before any visible progression surface.

A real RED workout is not manufactured for QA; RED remains a separate controlled safety-review case before broad rollout.

## Production status

This branch is draft-only. The normal Netlify production build chain remains unchanged. No release marker should be used until the Shadow port, regression gates, real-workout pilot boundaries, and an explicit release decision are complete.
