# Crownstorm UI v1.2 — Customization + Conversion Forge

This delta completes two major items from the Crownstorm product plan: profile customization and a direct cosmetic Crown Shard exchange.

## Added

### Customize Raizen

- equip any already-unlocked Raizen form
- equip earned titles
- equip owned frames
- equip owned auras
- equip owned banners
- locked forms and unowned cosmetics are not selectable
- cosmetic choices never modify progression or training

### Conversion Forge

Stormvault's Conversion Forge is now an explicit direct-purchase cosmetic exchange.

- spend earned Crown Shards on the exact cosmetic you choose
- no randomized paid purchase
- insufficient-shard actions are disabled
- owned rewards disappear from the purchase list
- buying a cosmetic changes only collection state

### Rank screen clarification

Identity Attributes now explicitly state that they are descriptive progression signals, **not training bonuses**.

## Validation

Crownstorm package v1.2 tests: **17/17 PASS**.

New tests verify:
- customization only exposes unlocked forms and owned cosmetics;
- Black Crown Ascension cannot be selected before it is unlocked;
- the Conversion Forge contains direct shard purchases and no paid-cache language;
- cosmetic purchases subtract Crown Shards while leaving lifetime XP/progression untouched.

## Delta checksums

Patch SHA-256: `44e8652034c92f34d0ca2271fa1af8155739405f85e886240a514925344f1167`

Gzip SHA-256: `c268a60349936430fd082a58a11426e1eda9e5a581456440dfc155178ad8d74f`

Base64 payload SHA-256: `4bc3d23e79ae5293d13e136ae9b589c4b296daa9b91f8ea7459a50c3f6e4be4d`
