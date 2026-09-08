# Crownstorm UI — Feature-Complete Pre-Integration Freeze

Status: **FEATURE COMPLETE FOR THE CURRENT PRODUCT PLAN / WAITING FOR HOST INTEGRATION**

## Locked product boundary

- normal LetMeFly Home stays unchanged
- Crownstorm entry is `More -> Crownstorm Path`
- Crownstorm runs inside a separate namespaced shell
- active set logging contains no XP, loot, rank, cache, or quest controls
- progression and rewards are downstream of governed training

## Implemented surfaces

- Crownstorm Hub
- Quests (visual/interaction anchor)
- Evolution Path
- Rank & Rewards with Stormvault throne Raizen hero
- Crownstorm Profile
- Stormvault
- Titles
- Journey
- Achievements
- Stormvault Caches
- Safekeeping Collection
- Conversion Forge
- Crownstorm Settings
- post-workout reward moments
- cache reveal overlay
- optional season card provider

## Implemented systems

- 10-form Raizen evolution ladder
- rank/reward presentation
- deterministic earned cache economy with guaranteed milestone rarity floors
- Iron / Storm / Fenrir / Black Crown / Sovereign cache tiers
- cosmetic-only randomized cache rewards
- duplicate -> Crown Shard conversion
- direct Crown Shard cosmetic purchase
- cosmetic equip for form/title/frame/aura/banner
- collection completion metrics
- read-only opened-cache history
- optional sound/haptic feedback adapter
- reduced-motion handling
- campaign chapter progression views
- descriptive achievement families
- quest summary and tabs
- immutable Journey timeline
- optional Then vs Now provider
- return briefing / Since Last Visit

## Safety/economy locks

- caches are earned, never sold
- XP cannot be purchased
- randomized rewards are cosmetic only
- Crown Shards cannot change training
- cosmetics cannot modify loads, sets, exercise selection, Training Maxes, readiness, or programming
- random extra work does not earn automatic progression XP
- active workout logging remains gamification-free
- Home remains gamification-free
- LIVE entry remains fail-closed until the Shadow pilot authorizes visibility

## Current validation ladder

- v1: 12/12 tests PASS
- v1.1: 14/14 PASS
- v1.2: 17/17 PASS
- v1.3: 21/21 PASS
- v1.4: 26/26 PASS
- v1.5: 30/30 PASS
- v1.6: 32/32 PASS

## Remaining host-integration work

The next work belongs at the integration boundary, not inside this isolated UI package:

1. bind real progression snapshot/view-model data;
2. bind real quest/achievement signals;
3. bind actual Crownstorm/Raizen image URLs from the approved asset library;
4. wire the hidden More entry behind the visible-pilot authorization gate;
5. run at least three real workouts in Shadow mode;
6. compare real post-workout moments/rewards against the immutable progression ledger;
7. only then enable PREVIEW for in-app UI QA;
8. LIVE visibility remains blocked until the pilot gate passes.

Nutrition quests remain intentionally provider-only until the separate Nutrition product is integrated.
