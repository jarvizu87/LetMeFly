# Crownstorm UI v1.5 — Campaign, Achievement Signals + Quest Summary

This delta builds the story/progression layer around real LetMeFly progression state without inventing training data or giving Crownstorm authority over programming.

## Added

### Crownstorm campaign path

A deterministic visual campaign is derived from real progression state:

1. First Hearth
2. Bastion Trial
3. Stormvault Path
4. Hollow Ascent
5. Crownward

Each chapter is `LOCKED`, `ACTIVE`, or `COMPLETE`. The campaign is presentation only; it does not advance the athlete's governed training position.

### Achievement signal policy

Achievement views can be built from explicitly supplied real metrics in these families:

- Strength
- Consistency
- Recovery
- Conditioning
- Program
- Comeback
- PR
- Streak
- Engagement

Missing metrics resolve to zero rather than fabricated athlete values.

### Quest summary

The Quest screen now summarizes:

- total quests
- completed quests
- active quests
- available XP
- available Crown Shards

The summary is read-only. It never awards XP itself.

### Journey expansion

Journey now combines:

- Crownstorm campaign chapters with world art
- optional `Then vs Now` comparison only when the host supplies real data
- immutable milestone timeline

No before/after metric is invented when a provider does not supply it.

## Validation

Crownstorm package v1.5 tests: **30/30 PASS**.

New tests verify:

- campaign status is derived from progression state and cannot mutate program data
- achievement policy consumes supplied metrics and defaults missing metrics to zero
- quest summary does not award or mutate XP
- Journey composes campaign, optional real comparison, and immutable history
- v1.4 -> v1.5 patch reconstructs the source package exactly (excluding generated `dist/`)

## Delta checksums

Patch SHA-256: `a059038d736e52c248834cddc6f1ab9ea1c6786acfcb34b2219ed480a4c3a22c`

Gzip SHA-256: `35e522c24a1700f91e27defa7655a441e91e8e713f9eeb82ae8437ade7caa4b8`

Base64 payload SHA-256: `2d85d1ed3344164da5ce4f70f1691bd880a1a293b4bec783e9759a6e7798291f`
