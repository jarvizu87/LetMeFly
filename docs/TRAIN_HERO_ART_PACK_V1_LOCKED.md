# LetMeFly Train Hero Art Pack V1 — LOCKED

Status: **LOCKED**  
Locked: **2026-09-14**  
Scope: Crownforge + Black Crown Train hero/cover artwork

## Purpose

This document freezes the approved nine-image Train hero set as the visual source of truth for the top Train cover/hero surface.

The hero is presentation only. Hero selection must never rewrite program structure, exercise order, sets, reps, loading, progression, athlete data, or workout history.

## Official nine-image set

| Key | Official label | Primary use |
| --- | --- | --- |
| `squat-lower-strength` | Squat / Lower Strength | Squat-dominant and lower-strength days |
| `bench-upper-push` | Bench / Upper Push | Bench, chest, horizontal-press and upper-push days |
| `deadlift-posterior-chain` | Deadlift / Posterior Chain | Deadlift, hinge and posterior-chain days |
| `olympic-explosive` | Olympic / Explosive | Clean, snatch, high-pull and explosive work |
| `conditioning-carries` | Conditioning / Carries | Sleds, general carries, conditioning and work capacity |
| `accessory-recovery-work-capacity` | Accessory / Recovery / Work Capacity | Accessory, mobility, recovery, kettlebell and mixed days |
| `yoke-trap-strength` | Yoke / Trap Strength | Yoke, heavy carries, trap and upper-back emphasis |
| `overhead-vertical-strength` | Overhead / Vertical Strength | OHP, push press and vertical-strength emphasis |
| `realization-testing-crown-day` | Realization / Testing / Crown Day | Testing, PR, peak and Realization milestone days |

The exact approved source hashes and stable delivery filenames are recorded in:

`overlays/ui-command-v2/static/train-heroes-v1/manifest.json`

## Character and visual continuity lock

All nine covers belong to one visual series and must preserve the same recurring LetMeFly athlete identity and world:

- muscular tan-skinned male athlete
- long dark braids
- full dark beard
- black sunglasses
- strong tattoo-sleeve treatment
- black/red training clothing and footwear
- dark industrial strength gym
- red and purple neon lighting
- high-contrast black/red/purple palette
- recurring red muscular bird/rooster gym mural and environment cues
- cinematic widescreen hero composition

Do not replace individual covers with unrelated stock photography, a different character, a different gym world, or a different art style inside V1.

## Selection rules

Hero selection is deterministic and workout-aware. It follows the selected governed workout/day's dominant training emphasis. It must not rotate randomly merely for visual variety.

A day can contain several training methods. Select the hero representing the day's strongest programmed identity, using program rules and the actual session structure rather than exercise name coincidence.

When no category clearly dominates, use `accessory-recovery-work-capacity` as the fallback.

Black Crown testing/peak/Realization sessions may intentionally override normal movement emphasis with `realization-testing-crown-day` when the session is a formal test, PR, peak, or Crown milestone.

Black Crown yoke/trap-specific work may use `yoke-trap-strength` instead of generic `conditioning-carries` when yoke/trap development is the session's defining purpose.

## Change control

V1 is frozen. Do not silently replace, reorder, relabel, or repurpose these nine heroes.

An art change requires one of the following:

1. an explicit reviewed correction to V1, with the source hash and manifest updated intentionally; or
2. a new versioned art pack such as `train-heroes-v2`.

Routine UI work, responsive-layout work, cache changes, exercise-art work, program updates, or workout-mode work must not alter the V1 hero identities.

## Implementation rule

The Train header must bind to the selected day/workout and update when the selected day changes. A single hard-coded squat/lifter image is not compliant with this standard.

Desktop and mobile must use the same semantic hero selection. Responsive cropping may differ, but the selected hero identity must not differ solely because of viewport size.
