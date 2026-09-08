# LetMeFly Crownstorm UI v1

This is the isolated implementation lane for LetMeFly's gamification subsystem.

## Locked product boundary

The normal LetMeFly Home dashboard is unchanged.

Crownstorm is entered through:

`More -> Crownstorm Path -> separate Crownstorm shell`

The production entry remains hidden until the progression Shadow pilot's fail-closed visibility authorization passes. A PREVIEW mode exists only for isolated UI QA.

## Implemented subsystem surfaces

- Crownstorm Hub
- Quests — visual/interaction anchor
- Evolution Path
- Rank & Rewards — Stormvault throne Raizen hero
- Crownstorm Profile
- Stormvault
- Titles
- Journey
- Achievements
- Stormvault Caches / loot boxes

## Cache policy

Caches are earned, never sold. Randomized rewards are cosmetic only. XP cannot be bought. Caches cannot affect prescribed training, readiness, loads, sets, progression TMs, or exercise selection. Duplicate cosmetics auto-convert to Crown Shards.

## Art

The visual catalog is keyed to the existing Crownstorm/Raizen image library. Runtime public IDs are defined but image binaries are not duplicated into this overlay.

## Safety

All CSS is `.cs-*` namespaced. The overlay contains no Home/Train selectors and no programming code.
