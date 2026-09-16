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

Stage 3 passed:

- exact-current-source reconstruction
- current data-contract inspection
- read-only evidence mapping audit
- substitution provenance cases
- Green and Yellow fixtures
- future/inactive decision rejection
- extra/duplicate set cases
- foreign/missing readiness/session cases
- TypeScript typecheck
- production candidate build
- Crownstorm absence guard
- privileged-secret absence guard

## Stage 4 — isolated append-only pilot evidence journal

Next, persist only derived Shadow pilot evidence in a separate, private pilot journal so a real completed-workout review survives reload. This journal must not modify or duplicate canonical LetMeFly workout authority.

Stage 4 must remain:

- append-only / replay-safe
- isolated from `workoutSessions`, `workoutExercises`, `workoutSets`, readiness, profile, TMs, program instances, and sync outbox
- fail-open relative to workout completion
- invisible in normal UI
- non-networked initially
- incapable of enabling Crownstorm or visible progression

Historical runtime-v6 through runtime-v10 remain reference material for immutable original-hook receipts, provenance, human review, dispositions, backlog reporting, and audit export. They are not merged directly.

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

The pilot is **not accepted** merely because CI is green. Real-workout evidence is still required. Historical runtime-v10 acceptance intent remains the reference for later operational hardening, including immutable receipts/provenance, replay/idempotency, human review, export/restore, and explicit operator authorization before any visible progression surface.

A real RED workout is not manufactured for QA; RED remains a separate controlled safety-review case before broad rollout.

## Production status

This branch is draft-only. The normal Netlify production build chain remains unchanged. No release marker should be used until the Shadow port, regression gates, real-workout pilot boundaries, and an explicit release decision are complete.
