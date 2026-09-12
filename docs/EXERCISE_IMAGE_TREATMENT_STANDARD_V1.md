# LetMeFly Exercise Image Treatment Standard v1

Status: LOCKED VISUAL STANDARD

This standard connects the grounded exercise imagery already created for LetMeFly with the final cinematic black / steel / red application theme, with purple retained as a secondary Raizen/Fenrir energy accent. It is presentation-only. Exercise mappings, program prescriptions, workout history, readiness, progression, substitutions, and athlete data remain authoritative and unchanged.

## Core principle

LetMeFly intentionally uses two related visual layers:

1. **Identity / world art** — Raizen, Fenrir, mountains, storms, crowns, runes, red environmental glow, purple lightning/energy, milestones, banners, and motivational imagery.
2. **Exercise instruction art** — the existing approved exercise images used to identify and demonstrate the programmed movement.

Exercise instruction art must remain practical and recognizable. It should feel integrated into the LetMeFly world without being recolored or regenerated merely to match the fantasy palette.

## Source-art rule

- Keep the existing approved exercise image for each exact exercise.
- Do not replace mapped exercise art with generic Raizen/Fenrir art.
- Do not recolor the source image itself.
- Do not apply filters that obscure technique, equipment, limb position, or movement identity.
- Do not stretch images.
- Existing private/custom exercise-art resolution remains the source of truth.

## Train treatment

Active Train cards use the previously approved blended-card composition:

- compact image region integrated into the card
- image fades into the dark text/logger area
- no hard rectangular image boundary
- logging, prescribed load, Bar Loader, RPE, previous performance, and controls remain visually dominant
- red/black chrome carries the main application identity around the card
- purple may appear only as a restrained secondary energy/detail accent and never as a heavy image tint

Upcoming/compact exercise images use the same subtle edge language.

## Exercises tab treatment

Exercise library cards:

- keep the exact approved exercise artwork
- thumbnail may use `cover` when explicitly functioning as a thumbnail
- center of the image remains visually neutral/true to the source
- dark vignette is concentrated at image edges
- restrained red edge/focus framing connects the card to the Home-led LetMeFly palette
- purple may remain as a very subtle secondary identity/energy tint, not the default selection color
- hover/focus/selection may increase red edge emphasis
- text remains on a black/steel surface outside the instructional image

Exercise Intelligence/detail panel:

- reuse the same mapped exercise artwork through the existing `data-exercise-art` resolver
- display in an aspect-ratio-safe `contain` frame
- use a dark background for letterboxing when needed
- keep perimeter treatment restrained so the movement stays visually neutral and readable
- keep coaching cues, muscles, mistakes, substitutions, safety, and Watch Exercise controls unchanged in meaning

## Multi-image exercises

Exercises represented by multiple component images or alternatives retain every approved component.

- never collapse multi-part art into one misleading image
- retain existing labels where the UI currently requires them
- use the same black/steel frame and restrained red-first edge treatment

## Shared compact surfaces

Compact previews used by Train, substitutions, desktop flow, or next-exercise strips should share the same restrained border/vignette language when they use exercise art.

Do not force identity/banner styling into these practical movement previews.

## Accent usage limit

Red is the primary UI integration accent around exercise surfaces; purple is secondary energy/gamification detail. Neither color is permission to recolor the instructional image itself.

Use red for:

- active/selected borders
- focus framing
- card/action emphasis
- restrained perimeter gradients

Use purple only for:

- subtle Raizen/Fenrir energy details
- tiny secondary perimeter accents
- gamification/identity flourishes that do not compete with movement clarity

Do not use heavy full-image red or purple overlays that make the exercise harder to read.

## Responsive rules

On mobile:

- preserve exercise recognition first
- no horizontal overflow
- thumbnails remain compact and touch-friendly
- detail art may use a taller aspect ratio when necessary
- controls and text must remain readable above visual treatment

On desktop/tablet:

- larger detail media may be shown
- card density may increase
- the same source image and treatment rules remain in force

## Accessibility and interaction

- image treatment must not intercept taps/clicks
- keyboard focus remains visible
- reduced-motion users do not receive unnecessary card animation
- artwork remains supplemental to explicit exercise names and coaching text

## Data / coaching boundary

This standard may change CSS and presentation-only DOM decoration. It may not:

- alter program prescriptions
- alter set/reps/load/RPE values
- alter workout persistence
- alter substitutions or progression rules
- alter readiness
- alter training maxes
- write private athlete data

## QA acceptance criteria

A release passes only when:

- existing exercise images are still used for their mapped exercises
- Train art remains blended and compact rather than dominating the logger
- Exercises thumbnails feel integrated with black/steel/red LetMeFly styling without obscuring the movement
- purple remains secondary rather than becoming the default selected/focus language
- Exercise detail art uses the same mapped image and does not stretch
- multi-part exercise art remains complete
- mobile 360px and 412px layouts do not horizontally overflow
- keyboard/touch controls remain usable
- no exercise/program/private-data behavior changes are introduced by the theme layer

Implementation reference: `exercise-image-theme-v1`, the approved Train blended-card treatment, and the final `color-harmonization-v1` layer. Where earlier component CSS still contains purple-first tokens, those declarations are implementation scaffolding only; the final color-harmonization layer is authoritative for rendered UI and design review.
