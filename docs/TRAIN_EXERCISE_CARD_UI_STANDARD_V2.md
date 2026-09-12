# LetMeFly Train Exercise Card UI Standard v2

Status: LOCKED PRESENTATION STANDARD — supersedes v1 image-layout rules where they conflict.

This revision records the approved Train direction that merges the existing governed workout-card behavior with the cinematic Home/Coach visual language. It changes presentation only. Crownforge, Crown Maintenance, Black Crown, workout prescriptions, progression rules, athlete position, readiness data, persisted workout data, and completion rules remain authoritative.

## Core rule

The Train tab remains workout-first. Existing exercise artwork is retained, resized without distortion, and visually blended into the card so it supports rather than dominates logging.

No approved exercise artwork is discarded solely because of this redesign.

## Active exercise artwork

The governed current exercise uses an integrated media treatment:

- retain the exercise's approved artwork
- place the image in a compact right-side region of the active card
- preserve source proportions; never stretch
- fit the artwork to the available region and use approved focal positioning when available
- dissolve the left and lower image edges into the dark card with gradients/overlays
- keep exercise name, prescription, previous performance, coaching context, Bar Loader, set controls, and logging legible above the image treatment
- allow rest-timer UI to share the visual region when the runtime provides it
- do not let the image intercept taps or block workout controls

The integrated art should read as one composition with the text, not as a separate thumbnail or hard-edged rectangle.

## Compact/upcoming exercise artwork

Upcoming, completed, grouped-work, and collapsed cards may show smaller artwork on the right side:

- maintain aspect ratio
- prefer full-image fit in the compact region
- use a dark text-to-image gradient
- never stretch the asset across the full card
- keep titles and key prescription metrics readable at phone widths

## Workout flow and logging

The existing governed workout workflow remains intact:

- readiness before workout start where applicable
- section/block navigation
- grouped circuit/superset/tri-set structure
- existing Watch Exercise, Substitute, Ask Coach/Notes affordances where provided by the current runtime
- previous/current performance context
- prescribed Bar Loader data where applicable
- existing set logger and numbered set progress
- rest behavior and saved-set recovery
- review/completion and early-end protections

Presentation changes must not rewrite the program or bypass native persistence controls.

## Active / preview / completed / rest-day behavior

The state and data rules from Train Exercise Card UI Standard v1 remain authoritative:

- Active Day: interactive only at the governed current position.
- Preview Day: same premium quality but write controls remain read-only/disabled.
- Completed Day: historical results remain recognizable and protected from accidental duplicate starts.
- Rest Day: no fabricated exercise logger.

This v2 revision supersedes v1 only where v1 required the primary exercise image to occupy a full-width square frame. The new canonical active-card treatment is the compact blended image treatment described above.

## Responsive requirements

At phone widths:

- the image must not force horizontal scrolling
- exercise copy receives enough protected dark space to remain readable
- logging controls remain touch-friendly
- set selectors scroll horizontally when necessary
- the blended image may become slightly narrower on small phones

At tablet/desktop widths:

- the artwork region may grow modestly
- it must still remain integrated into the card rather than becoming a separate billboard
- card hierarchy and governed workout behavior remain the same

## QA acceptance criteria

A release passes this standard only when:

- existing exercise artwork is still used where mapped
- active-card artwork blends into the card without hard rectangular edges
- source art is not stretched
- exercise title/prescription and logging controls remain readable and tappable at 360px and 412px widths
- compact cards do not become image-heavy
- no page-level horizontal overflow is introduced
- workout persistence, readiness, rest, substitutions, Coach/video actions, program position, TMs, and prescriptions are unchanged by the image treatment
- Crownforge and Black Crown prescriptions remain byte-for-byte governed by their existing program sources rather than this presentation layer

## Implementation boundary

The first implementation is the CSS-only `train-card-image-blend-v1` overlay. It intentionally reuses the current exercise-art mapping and workout-flow DOM instead of adding a second image system or changing workout data.
