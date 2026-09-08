# LetMeFly Train Exercise Card UI Standard v1

Status: LOCKED PRESENTATION STANDARD

This document defines the canonical visual and interaction model for the Train tab. It changes presentation only. Crownforge, Crown Maintenance, Black Crown, workout prescriptions, progression rules, athlete position, and persisted workout data remain authoritative.

## Core rule

LetMeFly uses one premium exercise-card visual language across current and future training days. State changes behavior, not visual quality.

The canonical card order is:

1. Full approved exercise artwork
2. Movement/category label and exercise name
3. Mandatory/optional/status badge and video affordance
4. Watch Exercise / Substitute / Ask Coach actions
5. Prescription and coaching context
6. Set logger or read-only set prescription
7. Numbered set selector/progress
8. Next exercise strip

Canonical exercise artwork must not be stretched or collapsed into a shallow banner. Square exercise artwork uses a square full-width frame with the complete artwork visible.

## Active Day — live workout

The athlete's governed current position is fully interactive.

Visual state:
- full-width square exercise artwork
- exercise title and movement/category treatment
- mandatory/optional status
- Watch Exercise, Substitute, Ask Coach
- full set logger
- numbered set selector
- next-exercise strip
- active exercise receives the red LetMeFly focus treatment

Interaction state:
- reps editable
- load editable
- RPE editable
- set completion enabled
- set navigation enabled
- prescribed plate/loading helper visible where applicable
- readiness save/start workout enabled before the session begins
- workout completion remains protected by existing completion/early-end confirmation rules

Data rule:
- logging writes only through existing workout persistence controls
- UI presentation never changes the governed prescription

## Preview Day — future/non-current governed position

Future days use the same premium card shell as Active Day. They must never degrade into a plain text list or shallow preview banner.

Visual state:
- same full-width square artwork
- same exercise title hierarchy
- same movement/category and mandatory/optional presentation
- Watch Exercise, Substitute, Ask Coach remain available when those actions are read-only/informational
- full governed prescription visible by default
- set structure may be displayed using the same set-card styling
- clear PREVIEW ONLY state near the day/workout header

Interaction state:
- reps/load/RPE controls are read-only or disabled
- set completion is disabled
- readiness cannot be saved for the future position
- Start Workout is disabled/hidden for the future position
- a Make Current Position control may be offered through the existing explicit governed-position action

Safety/data rule:
- previewing another day must never mutate program position, workout history, readiness, set data, or training maxes
- the UI must not silently make a future day current

## Rest Day

Rest days retain the same LetMeFly visual quality without fabricating an exercise session.

Visual state:
- strong rest/recovery header
- current program, week, and governed position remain visible
- recovery guidance, optional mobility/recovery content, and next training milestone may be shown
- no fake exercise logger

Interaction state:
- no workout set controls
- no workout completion controls
- optional Coach and recovery-information actions remain available

Data rule:
- viewing a rest day never advances the program
- moving the calendar position remains an explicit governed action

## Completed Day

A completed workout remains visually recognizable as the same training day while clearly showing completion.

Visual state:
- premium exercise cards retained
- completed sets display completed state
- workout summary and performance history emphasized
- historical load/reps/RPE remain readable

Interaction state:
- historical results are read-only unless the app enters an explicit supported correction/edit workflow
- no accidental duplicate workout start from the completed card

## Grouped work — circuits, supersets, tri-sets

Grouped work preserves the canonical card while adding group/round context.

- active movement expands into the full card
- upcoming/completed movements may use compact next/previous strips during the live session
- group node/round progress stays visible
- compact strips must use complete, undistorted thumbnails
- switching between group movements must not alter the programmed grouping or prescription

## Image fidelity lock

For canonical exercise artwork:
- square source art -> square full-width primary frame
- `object-fit/background-size: contain` for the primary exercise image
- centered positioning unless a specifically approved per-asset focal point exists
- dark LetMeFly background may letterbox non-square legacy artwork
- never stretch
- never force square artwork into a shallow cinematic banner
- thumbnails may crop only where explicitly designed as thumbnails

## Responsive behavior

On phone widths:
- preserve square primary art
- preserve three metric columns for reps/load/RPE where supported by the existing workout-flow controls
- buttons remain touch-friendly
- exercise names may wrap naturally
- set selectors scroll horizontally rather than shrink into unreadable controls
- no page-level horizontal overflow

Tablet/desktop may increase spacing but should not introduce a different card hierarchy.

## QA acceptance criteria

A release passes this standard only when:
- Active Day primary exercise art is square/full-frame and not cropped into a banner
- Preview Day primary exercise art matches the Active Day visual treatment
- future-day prescription is visible without a legacy View Full Plan gate
- future-day write controls cannot mutate athlete state
- Watch Exercise / Substitute / Ask Coach remain visually consistent
- grouped-work thumbnails are not stretched
- 360px and 412px mobile layouts do not overflow horizontally
- Crownforge and Black Crown program prescriptions are unchanged by the UI work

This standard is the source of truth for future Train-tab presentation changes unless intentionally superseded by a later locked revision.
