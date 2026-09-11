# LetMeFly Home/Main UI — Option 1 Command — LOCKED V1

## Status

This document is the visual/layout contract for the LetMeFly **Home/Main tab only**.

The previously simplified structural Home remains useful as a data/event source, but it is **not** the approved visual target.

## Locked Design Direction

**Option 1 — Command**

The Home tab should feel like a serious athlete command center: cinematic, dark, high-contrast, restrained, mobile-first, and clearly related to Crownforge / Black Crown without becoming decorative clutter.

## Locked Structure

1. **Compact branded header**
   - official LetMeFly wolf/logo identity
   - LetMeFly wordmark + small tagline
   - compact utility/notification control
   - athlete identity/avatar treatment

2. **Open greeting**
   - time-aware greeting using athlete name when available
   - short disciplined supporting line
   - not enclosed in another card

3. **Single premium “Your Command” hero**
   - image-driven mountain atmosphere
   - restrained wolf/brand identity layer
   - current program
   - week/day/current workout
   - useful workout metadata
   - real workout progress bar
   - large dominant **Start Workout** action
   - this is the primary Home surface

4. **2 × 2 coaching-intelligence grid**
   - Readiness
   - Recent Performance
   - Next Milestone
   - Coach Insight / Coach Focus
   - cards must remain readable on normal modern phone widths
   - only very narrow phones may collapse to one column

5. **Athlete metrics rail**
   - Tracked Lifts
   - Workouts
   - Personal Records
   - Bodyweight
   - visually quieter than the primary command hero and coaching cards

6. **Existing app navigation remains authoritative**
   - Home/Main UI work must not redesign Train, Program, Progress, More/Coach, or Profile as part of this lane

## Visual Rules

- near-black base surfaces
- LetMeFly red used deliberately for active/command emphasis
- mountain/Fenrir/wolf identity should support hierarchy, not overwhelm it
- no placeholder crown glyph as the dominant hero artwork
- larger, readable typography; avoid microcopy that becomes functionally unreadable on phones
- one dominant hero instead of a wall of equal-weight cards
- no horizontal page overflow
- Start Workout must remain immediately obvious

## Data / Architecture Boundaries

This UI layer must **not**:

- change Crownforge or Black Crown prescriptions
- change sets, reps, loads, progression, readiness rules, substitutions, or program position
- change workout persistence behavior
- change cloud-sync behavior
- write private athlete data
- couple Home rendering to cloud availability
- mount the Progress dashboard on Home

The Home layer may read existing public UI state and existing private athlete summary data through the already-established read-only Home hooks.

## Acceptance Checks

At a 412 px mobile viewport:

- cinematic command hero is visible
- mountain artwork is active
- workout progress bar is present
- Start Workout is a dominant full-width mobile action
- header utility treatment is present
- Readiness + Recent Performance share row 1
- Next Milestone + Coach Insight share row 2
- four athlete metrics remain present
- no Progress dashboard contamination
- no horizontal page overflow

## Governance

Future Home visual changes should be intentional changes to this contract, not accidental fallback to the simplified structural Home.
