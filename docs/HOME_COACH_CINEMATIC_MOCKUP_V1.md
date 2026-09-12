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
2. One continuous mountain hero containing the time-aware greeting and Your Command workout card
3. A dark inset workout card below the greeting, with Fenrir at the right of the shared scene
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
- Use `/ui/home-mountain-cinematic-v2.webp` as the landscape stage. This is a clean, text-free raster reconstruction derived from the latest dashboard mockup; it is not an exact pixel extraction. The earlier hand-drawn red SVG did not reproduce the reference's detailed mountain art.
- Keep the wolf on the right side and substantially smaller than the landscape stage.
- Do not allow the wolf to cover the central mountain range.
- Preserve text readability with dark gradients instead of replacing the landscape with an opaque panel.
- Do not replace the real LetMeFly logo with generated/mock branding.
- Reset all four portrait offsets before anchoring Fenrir to the right. Feather all portrait edges so the opaque source background does not appear as a rectangle.
- A passing asset-URL/layout audit does not establish visual fidelity. Compare rendered screenshots with the mockup before describing the design as matched.
- The greeting and workout share one `.lmf-home-option1-hero` background. The inset card must not repeat the mountain image or create a second banner.
- On desktop, the original Start Workout button sits to the right of the inset card. On mobile it spans the bottom of the same dark card treatment. Move the original control and retain its existing event delegation; do not clone it or duplicate workout actions.

## Coach visual alignment

The Coach tab retains its existing logic, context, quick prompts, chat flow, and composer.

Presentation should use:

- the same mountain/wolf cinematic language as Home
- current Fenrir artwork in the Coach banner/avatar treatment
- red command accents
- dark premium context cards and chat surfaces
- clear focus states and readable mobile controls

### Approved Coach workspace

- One mountain/Fenrir banner, using the same existing raster assets as Home.
- A conversation panel with all six original quick prompts, the actual most recent
  submitted question, the native answer, and the native send/keyboard controls.
- No fabricated conversation, timestamps, online indicator, or saved chat history.
- Desktop: today's focus, exercise selector, and supporting details beside the chat.
- Mobile: today's focus and exercise selector above quick actions, conversation,
  supporting details, and a composer that clears the six-item bottom navigation.
- Profile, recent workouts, and coaching evidence start collapsed. Native details
  preserve open state and input focus through the existing insights refresh cycle.
- Session guidance remains expandable inside the one current-workout card.
- Context modules remain descendants of `.coach-chat`, preserving their mount and
  refresh anchors. Controls are moved rather than cloned, so original listeners
  remain attached. No exercise or training decision handler is replaced.

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
