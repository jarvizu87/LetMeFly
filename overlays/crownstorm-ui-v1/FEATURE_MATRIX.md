# Crownstorm Feature Matrix

| Surface / system | Current implementation | Data source | Visible before pilot? |
|---|---|---|---|
| More entry | Implemented contract; fail-closed LIVE gate | visibility authorization | No |
| Hub | Implemented render/view model + Since Last Visit | progression snapshot/history | No |
| Quests | Implemented tabs, featured mission, summary | progression quests + app signals | No |
| Evolution | Implemented 10-form Raizen ladder | level + governed milestones | No |
| Rank & Rewards | Implemented; Stormvault throne hero locked | progression rank/XP + collection | No |
| Profile | Implemented metrics + collection + customization entry | progression/profile collection | No |
| Customize Raizen | Implemented form/title/frame/aura/banner equip | unlocked/owned collection state | No |
| Stormvault | Implemented room navigation | collection/history summaries | No |
| Safekeeping Collection | Implemented owned cosmetics + unlocked forms | collection state | No |
| Titles | Implemented earned/equipped/locked states | earned title IDs | No |
| Journey | Implemented campaign chapters + timeline + optional Then vs Now | immutable progression/history + optional host comparison | No |
| Achievements | Implemented 9 descriptive families | host-supplied verified metrics | No |
| Caches | Implemented deterministic earned-only cache system | progression milestone events | No |
| Cache rarity floors | Implemented Common+/Uncommon+/Rare+/Epic+/Legendary guarantees by tier | cache tier | No |
| Cache reveal | Implemented modal reveal + canonical art + reduced-motion support | cache result | No |
| Opened cache history | Implemented read-only Vault history | collection state | No |
| Crown Shards | Implemented cosmetic economy | cache grants / duplicate conversion / spend | No |
| Conversion Forge | Implemented exact cosmetic purchase with earned shards | collection state | No |
| Post-workout moments | Implemented XP/level/rank/form/quest/achievement/cache moments | before/after progression snapshots | No |
| Sound / haptics | Implemented optional host adapter; silent by default | UI preferences + host capability | No |
| Crownstorm Settings | Implemented motion/sound/haptics/art/cache animation toggles | UI preferences | No |
| Optional season card | Provider-ready; hidden without real season data | season provider | No |
| Nutrition quests | Provider slot only | separate Nutrition product later | No |

## Home rule

No Crownstorm XP, rank, cache, quest, form, shard, reward, or Crownstorm navigation UI is added to the normal LetMeFly Home dashboard.

## Workout rule

Active set logging remains gamification-free. Reward moments occur only after workout completion.

## Current release

Crownstorm UI v1.6: **32/32 tests PASS**. See `FEATURE_COMPLETE_FREEZE.md` for the pre-integration boundary.
