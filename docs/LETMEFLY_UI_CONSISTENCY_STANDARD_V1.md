# LetMeFly UI Consistency Standard v1

Status: approved implementation standard.

## Purpose

This standard connects the approved Home, Train, Program, Progress, Exercises, Coach, Profile, and More interfaces without flattening their different jobs. LetMeFly should feel like one serious strength-and-conditioning system while keeping workout execution and athlete data easy to read.

## Visual language

- Base surfaces: near-black and charcoal/steel.
- Primary interface accent: purple (`#a855f7` family) with lighter purple for focus/selected states.
- Identity art: Raizen, Fenrir, mountains, storms, crowns, and Black Crown imagery.
- Safety, destructive actions, injury/pain warnings, and danger states remain red. Purple must never erase safety semantics.
- Typography keeps the established display/serif treatment for major headings and clear sans-serif text for controls, logging, and dense training information.

## Exercise imagery

Exercise imagery follows `EXERCISE_IMAGE_TREATMENT_STANDARD_V1.md`.

- Existing approved exercise images remain the movement source of truth.
- Do not regenerate exercise art merely to match the fantasy identity palette.
- Train uses compact blended exercise imagery so workout logging remains dominant.
- Exercises uses framed thumbnails/details with restrained purple/black perimeter treatment.
- Shared styling must never replace `--exercise-art`, alter private exercise-art delivery, or substitute misleading movement imagery.

## Navigation

- Keep the existing working desktop and mobile navigation architecture.
- Active navigation uses the shared purple selected state.
- Keyboard focus uses the same purple interaction language.
- More is the utility/secondary-command surface, not a replacement for primary training navigation.

## More workspace

The approved More layout contains:

- Calendar
- Nutrition support
- Readiness
- Testing
- Utilities
- Resources
- Data & Backup
- Settings
- Help & Support
- About on desktop

More must route to real capabilities only. Until a dedicated module exists, a card may route to the existing screen that owns that capability rather than inventing a dead route. In v1:

- Nutrition and Help & Support route to Coach.
- Readiness and Utilities route to Train.
- Testing routes to Program.
- Resources routes to Exercises.
- Data & Backup routes to Profile.
- Calendar and Settings use their existing routes.

## Program and athlete data safety

Visual implementation must not change:

- Crownforge or Black Crown prescriptions
- exercise selection or order
- sets, reps, loading, rest, or progression
- training maxes
- workout history
- readiness data
- private athlete data
- Coach decision logic

UI changes may present existing information differently, but presentation is not permission to rewrite training logic.

## Responsive behavior

- Desktop can use denser multi-column workspaces and contextual side panels.
- Mobile prioritizes one-column flow, readable workout controls, thumb-friendly targets, and bottom-navigation clearance.
- Cards may simplify secondary action text on mobile, but the destination and meaning must remain unchanged.
- No horizontal overflow is acceptable in normal supported phone widths.

## Final rule

Cinematic identity motivates the athlete; training information stays practical. LetMeFly should look like the Black Crown world without making the athlete work harder to read, log, understand, or complete the program.
