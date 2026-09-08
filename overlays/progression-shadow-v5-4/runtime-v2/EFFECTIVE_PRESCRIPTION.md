# LetMeFly V5.4 — Effective Prescription Decisions for Progression Shadow Mode

Status: runtime support complete; no visible progression UI enabled.

## Purpose

Yellow/readiness coaching can intentionally reduce an exercise from the source prescription without rewriting Crownforge. Progression needs to know that revised target so completing the governed reduction can count as full compliance without awarding XP for work that was never performed.

Example:

- source Front Squat prescription: 7 governed set rows
- Coach-authorized Yellow target: 5 sets
- athlete completes 5 sets
- workout history remains 5 completed of 7 source set rows
- coaching decision records the effective target of 5
- progression receives `effectivePrescribedUnits: 5`
- the exercise can earn its full eligible XP ceiling and can satisfy the session-completion check

The source program is not rewritten.

## Canonical coaching decision record

V5.4 already has a private `coachingDecisions` store and cloud entity. No new table/store is required.

The progression integration uses only the existing top-level coaching-decision fields:

- `athlete_id`
- `program_instance_id`
- `workout_session_id`
- `decision_type`
- `before_state`
- `after_state`
- `rationale`
- `source`
- `status`
- `effective_from`

Exercise-specific detail stays inside JSON state so the cloud row does not require a new top-level SQL column.

### decision_type

`effective_prescription_adjustment`

### before_state

```json
{
  "workout_exercise_id": "<workoutExercises.id>",
  "exercise_key": "front-squat",
  "prescribed_units": 7
}
```

### after_state

```json
{
  "workout_exercise_id": "<workoutExercises.id>",
  "exercise_key": "front-squat",
  "effective_prescribed_units": 5
}
```

For source-conditional work, `after_state` may also include:

```json
{
  "conditional_active": true
}
```

or `false` when the conditional item is explicitly removed from the effective target.

## Writer API

`recordEffectivePrescriptionDecision()` is implemented in:

`src/services/coaching-decision-service.ts`

The writer:

- verifies athlete ownership of the session and exercise;
- verifies that the exercise belongs to the session;
- derives original units from the actual workout set skeleton;
- requires a rationale;
- only permits non-negative integer targets;
- rejects an effective target above the current governed prescription;
- rejects reducing source-MANDATORY work to zero (RED/safety-stop handling is the correct path);
- writes through the normal local mutation + sync outbox path;
- does not rewrite program definitions or workout set rows.

## Resolver semantics

Multiple decisions remain auditable. The latest active decision at or before workout completion wins for each `workout_exercise_id`.

A future-dated decision cannot affect an earlier completed workout.

Deleted/inactive/non-matching decision types are ignored.

## Progression mapping

`lmf-shadow-adapter.ts` now loads active coaching decisions for the completed session and maps them into `CompletionRecord.effectivePrescribedUnits`.

Rules:

- mandatory source work remains mandatory;
- source-conditional work can use explicit `conditional_active` from the decision;
- source-optional work cannot be promoted into core adherence;
- RED handling overrides earlier conditional activation;
- an imported malformed/oversized target cannot expand the XP ceiling; progression caps it at the governed set count and emits a warning;
- if no explicit decision exists, the prior conservative Yellow fallback remains.

## Current UI boundary

The V5.4 public UI still does not automatically author these decisions. That is intentional.

Readiness alone does not invent a reduced target. A target must come from an intentional Coach/program action before this writer is called.

This means Shadow Mode remains conservative for Yellow sessions that do not yet have a recorded coaching decision, while the underlying persistence + mapping path is now ready for the future Coach Mode authoring flow.

## Validation

`npm run audit:progression-shadow`

Current audit covers:

- all 42 embedded Crownforge days (Weeks 1–6) mapping cleanly;
- latest decision wins;
- future decision ignored;
- mandatory Yellow effective target mapping;
- conditional active/inactive decision mapping;
- governed Yellow completion receiving the session-completion bonus;
- RED overriding prior support activation;
- oversized imported target capped to the source prescription.
