# Progression Shadow — current-main port

## Purpose

Port the hidden Progression Shadow pilot onto the current LetMeFly production reconstruction without giving it any authority over training, program state, athlete data, sync, or UI.

The older Progression Shadow draft PRs remain historical source material only. They were built against an older September 8 reconstruction and must not be merged directly into current `main`.

## Stage 1 — safe completion-event boundary

This stage installs a small observational module into the reconstructed app only during its dedicated audit workflow.

On a completed workout it may receive:

- completed workout/session ID
- athlete ID
- governed program key
- completed week/day
- completion timestamp

The stage-1 review is intentionally `unknown / observe` because the historical Green/Yellow/Red review engine has not yet been re-ported against the current private program-progression and workout-history contracts.

### Hard boundaries

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

## Stage 2 — review-engine port

After Stage 1 compiles and passes against the exact current production reconstruction, port the historical Shadow review engine into a read-only adapter that derives evidence from existing completed workout/history records instead of creating a second athlete-data store.

Stage 2 must preserve the original pilot acceptance intent:

- at least 3 real completed-workout reviews
- both Green and Yellow outcomes observed
- strength review spans multiple qualifying sessions across at least 21 days when applicable
- no automatic program/prescription changes
- no Crownstorm activation

The pilot is **not accepted** merely because CI is green. Real-workout evidence is still required.

## Production status

This branch is draft-only. The normal Netlify production build chain is intentionally unchanged in Stage 1. No release marker should be used until the Shadow port, regression gates, and real-workout pilot boundaries are explicitly approved.
