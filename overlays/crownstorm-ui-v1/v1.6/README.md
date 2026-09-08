# Crownstorm UI v1.6 — Guaranteed Milestone Cache Floors

This release closes the final loot-economy gap from the approved Crownstorm design: meaningful earned caches now guarantee a minimum cosmetic rarity instead of leaving every result to RNG.

## Guaranteed minimum rarity

Each earned cache guarantees its first cosmetic roll at or above:

- Iron Cache — Common+
- Storm Cache — Uncommon+
- Fenrir Cache — Rare+
- Black Crown Cache — Epic+
- Sovereign Vault — Legendary

Additional cosmetic rolls retain the normal deterministic tier rarity weights.

## Why

Major training milestones should feel meaningfully different from routine quest rewards. A program completion should never produce only low-tier cosmetic outcomes, and a Black Crown promotion should never feel weaker than the milestone that earned it.

## Economy boundaries remain locked

- caches are earned, never purchased
- no real-money randomized purchase exists
- rewards are cosmetic only
- duplicate cosmetics auto-convert to Crown Shards
- Crown Shards may buy exact cosmetics through the Conversion Forge
- XP cannot be purchased
- cache outcomes cannot modify training, readiness, loads, sets, Training Maxes, or exercise selection

## UI disclosure

The Caches screen now shows the guaranteed floor for each unopened cache and explains the Vault guarantees before the athlete opens anything.

## Validation

Crownstorm package v1.6 tests: **32/32 PASS**.

New tests verify:
- every tier's first cosmetic roll meets its guaranteed minimum across multiple deterministic seeds;
- the Caches UI discloses Rare+/Legendary guarantees;
- the UI explicitly states that caches are earned only and no real-money randomized purchase exists.

## Delta checksums

Patch SHA-256: `0d307729b39f134bd41f52244699dbe3e2d777f2a2fa97049b3a8d327f99612c`

Gzip SHA-256: `24076f3b50ea1223490c56486884d18303ee08e1941ff0eee57a5661b7db1023`

Base64 payload SHA-256: `9f8e7dc20484173e1943be72a427d17b7079cc22291b6fd17bb3bc0863b9dd22`
