# LetMeFly Home + Coach Cinematic Mockup Direction — LOCKED V1

## Status

Approved visual refinement for the live LetMeFly Home and Coach experience.

This layer keeps the existing Option 1 Home information architecture and all current coaching/program behavior. It changes presentation only.

## Approved visual target

The live app should match the approved mockup direction:

- near-black, high-contrast command-center presentation
- official current LetMeFly logo and wordmark
- the current Fenrir/wolf artwork already used by the UI
- cinematic mountain landscape retained as a major visual element
- the wolf is deliberately smaller than the earlier mockup so it supports the scene instead of covering the mountains
- red is the primary command/action accent
- Readiness uses green, Recent Performance uses blue, Next Milestone uses gold, and Coach Insight uses red
- cards are premium, restrained, readable, and mobile-first
- Home and Coach should feel like the same product family

## Home structure preserved

1. Compact official LetMeFly header
2. Open time-aware greeting
3. Single dominant Your Command hero
4. Real workout progress
5. Dominant Start Workout action
6. 2 x 2 intelligence grid
   - Readiness
   - Recent Performance
   - Next Milestone
   - Coach Insight
7. Quieter metrics rail
8. Existing authoritative navigation

### Recent Performance data

Recent Performance shows the latest completed workout and its completion date,
program, and position from the same private, read-only session snapshot used for
the workout count. Today's unstarted workout is not evidence of empty history.
Loading, unavailable history, and genuinely empty history have separate messages.
Rendering the card must not modify saved sessions or start a workout.

## Hero art rules

- Use `/ui/fenrir.webp` for the current UI wolf.
- Use the existing mountain asset as the landscape stage.
- Keep the wolf on the right side and substantially smaller than the landscape stage.
- Do not allow the wolf to cover the central mountain range.
- Preserve text readability with dark gradients instead of replacing the landscape with an opaque panel.
- Do not replace the real LetMeFly logo with generated/mock branding.

## Coach visual alignment

The Coach tab retains its existing logic, context, quick prompts, chat flow, and composer.

Presentation should use:

- the same mountain/wolf cinematic language as Home
- current Fenrir artwork in the Coach banner/avatar treatment
- red command accents
- dark premium context cards and chat surfaces
- clear focus states and readable mobile controls

## Safety / architecture boundary

This visual layer must not change:

- Crownforge or Black Crown programming
- sets, reps, loads, progression, substitutions, or readiness rules
- workout logging or completion behavior
- athlete private data
- cloud/local persistence or sync
- program position or history
- Coach decision logic

## Mobile acceptance

At a normal modern phone width (approximately 390–430 px):

- the mountain landscape remains clearly visible
- the current wolf is visible but secondary
- Start Workout is a dominant full-width action
- the four intelligence cards remain a 2 x 2 grid where space permits
- key metrics remain readable
- navigation remains usable with safe-area spacing
- there is no horizontal page overflow

## Desktop acceptance

- the mountain scene receives more horizontal breathing room than the wolf
- Home remains centered and premium rather than stretched edge-to-edge
- the four intelligence cards remain balanced in two columns
- Coach uses the same visual family without changing its logic

## Release rule

Build and validate this first as a preview branch. Production still requires the existing intentional `[release netlify]` release marker.
