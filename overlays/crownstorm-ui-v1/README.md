# LetMeFly Crownstorm UI

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
- Customize Raizen
- Stormvault
- Safekeeping Collection
- Conversion Forge
- Titles
- Journey
- Achievements
- Stormvault Caches / loot boxes
- Crownstorm Settings
- post-workout reward moments

## Cache policy

Caches are earned, never sold. Randomized rewards are cosmetic only. XP cannot be bought. Caches cannot affect prescribed training, readiness, loads, sets, progression TMs, or exercise selection. Duplicate cosmetics auto-convert to Crown Shards.

As of v1.6, meaningful cache tiers also have disclosed minimum cosmetic rarity floors:

- Iron — Common+
- Storm — Uncommon+
- Fenrir — Rare+
- Black Crown — Epic+
- Sovereign — Legendary

## Art

The visual catalog is keyed to the existing Crownstorm/Raizen image library. The Rank & Rewards hero is locked to the seated Stormvault Raizen artwork. Runtime public IDs are defined so asset hosting can change independently of screen logic.

## Safety

All CSS is `.cs-*` namespaced. The overlay contains no Home/Train selectors and no programming code. Active set logging is gamification-free; reward moments appear only after workout completion.

## Current status

**v1.6 — feature-complete pre-integration candidate**

Validation ladder: 12/12 -> 14/14 -> 17/17 -> 21/21 -> 26/26 -> 30/30 -> **32/32 PASS**.

See `FEATURE_COMPLETE_FREEZE.md` for the remaining host-integration work.
