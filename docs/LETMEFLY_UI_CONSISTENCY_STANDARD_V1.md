# LetMeFly UI Consistency Standard v1

Status: approved implementation standard.

## Purpose

This standard connects the approved Home, Train, Program, Progress, Exercises, Coach, Profile, and More interfaces without flattening their different jobs. LetMeFly should feel like one serious strength-and-conditioning system while keeping workout execution and athlete data easy to read.

## Visual language

- Base surfaces: near-black and charcoal/steel.
- Primary interface and brand accent: red, following the approved Home mockup.
- Secondary identity/energy accent: purple (`#a855f7` family), reserved for Raizen/Fenrir energy, runes, gamification flourishes, and restrained fantasy detailing rather than every selected state.
- Identity art: Raizen, Fenrir, mountains, storms, crowns, and Black Crown imagery.
- Safety, destructive actions, injury/pain warnings, and danger states also use red, but must remain distinguishable through explicit copy, icons, contrast, and context instead of color alone.
- Typography keeps the established display/serif treatment for major headings and clear sans-serif text for controls, logging, and dense training information.

## Exercise imagery

Exercise imagery follows `EXERCISE_IMAGE_TREATMENT_STANDARD_V1.md`.

- Existing approved exercise images remain the movement source of truth.
- Do not regenerate exercise art merely to match the fantasy identity palette.
- Train uses compact blended exercise imagery so workout logging remains dominant.
- Exercises uses framed thumbnails/details with black/steel surfaces and restrained red selection/focus framing; purple may remain as a subtle secondary energy tint around identity details.
- Shared styling must never replace `--exercise-art`, alter private exercise-art delivery, or substitute misleading movement imagery.

## Navigation

- Keep the existing working desktop and mobile navigation architecture.
- Active navigation follows the shared red selected state.
- Keyboard focus follows the same red interaction language.
- Purple is not the default active-navigation color; it is secondary energy/gamification styling.
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

## Cascade and authority

Some earlier component-level styles retain legacy purple-first tokens because they are still used as lower-level theme variables or secondary energy accents. The final rendered palette is governed by `COLOR_HARMONIZATION_STANDARD_V1.md` and the late-loading color-harmonization layer. Future work must treat black/steel + red primary + purple secondary as the product standard.

## Final rule

Cinematic identity motivates the athlete; training information stays practical. LetMeFly should look like the Black Crown world without making the athlete work harder to read, log, understand, or complete the program.
