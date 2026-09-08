# Crownstorm UI Architecture

## Navigation boundary

The core LetMeFly mobile nav remains Home / Train / Program / Progress / More.

Crownstorm adds one row to More after visibility authorization:

- Crownstorm Path
  - Realm (Hub)
  - Quests
  - Evolution
  - Vault
  - Profile

Secondary routes are entered inside that shell:

- Rank & Rewards
- Titles
- Journey
- Achievements
- Caches

Exiting Crownstorm returns to More, not Home.

## Data authority

Crownstorm may read progression and canonical training summaries. It never authors:

- workout prescriptions
- readiness decisions
- training maxes
- exercise substitutions
- program position
- set/load targets

The progression engine remains the XP/quest/rank authority. Canonical LetMeFly history remains the training authority.

## Visibility gate

`LIVE` visibility requires all three:

1. explicit operator/app enable flag;
2. Shadow pilot gate passed;
3. stored provenance clean.

PREVIEW is allowed only in an isolated QA build. Production defaults to HIDDEN.
