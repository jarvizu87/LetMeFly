# Progression Shadow — current-main port

## Purpose

Port the hidden Progression Shadow pilot onto the current LetMeFly production reconstruction without giving it any authority over training, program state, athlete data, sync, or UI.

The older Progression Shadow draft PRs remain historical source material only. They were built against an older September 8 reconstruction and must not be merged directly into current `main`.

## Stage 1 — safe completion-event boundary

Stage 1 installs a small observational module into the reconstructed app only during its dedicated audit workflow.

On a completed workout it may receive:

- completed workout/session ID
- athlete ID
- governed program key
- completed week/day
- completion timestamp

The completion hook is after canonical workout persistence and before the existing authoritative program progression call. It is fail-open: a Shadow exception cannot block workout completion or Crownforge → Crown Maintenance → Black Crown progression.

Stage 1 passed against the exact current production reconstruction.

## Stage 2 — pure evidence/review engine

Stage 2 ports the non-gamified Green / Yellow / Red evidence rules as a pure module. It still does not read or write the database. A later adapter may feed it trusted completed-workout, readiness, and explicit coaching-decision evidence.

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

XP, levels, quests, streaks, and Crownstorm are intentionally **not** part of Stage 2. Those belong to a later isolated gamification-validation layer after the evidence adapter is trustworthy.

## Hard boundaries

Progression Shadow must not:

- write IndexedDB, localStorage, sessionStorage, or Supabase
- call network services
- mutate the active program instance or governed program definitions
- change training maxes, workout history, readiness, profile, or sync state
- render UI, show toasts, or change navigation
- auto-apply a recommendation
- import or activate Crownstorm/gamification
- block workout completion or authoritative progression if Shadow throws

The authoritative `program-progression-service.ts` remains the only current owner of Crownforge → Crown Maintenance → Black Crown progression.

## Stage 3 — current-data read-only adapter

After Stage 2 is green, connect the pure review engine to current private data using read-only queries only:

- completed workout/session skeleton and completed set actuals
- readiness record valid for that workout
- explicit coaching/program-authorized effective-target decisions when Yellow changes exist
- governed source priority and prescribed units

The adapter must not create a second athlete-data authority. It should derive a review from canonical LetMeFly records and return evidence to the Shadow module.

## Real-world pilot acceptance

The pilot is **not accepted** merely because CI is green. Real-workout evidence is still required. Historical runtime-v10 acceptance intent remains the reference for later operational hardening, including immutable receipts/provenance, replay/idempotency, human review, export/restore, and explicit operator authorization before any visible progression surface.

A real RED workout is not manufactured for QA; RED remains a separate controlled safety-review case before broad rollout.

## Production status

This branch is draft-only. The normal Netlify production build chain remains unchanged. No release marker should be used until the Shadow port, regression gates, real-workout pilot boundaries, and an explicit release decision are complete.
