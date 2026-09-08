# Crownstorm UI v1.1 — Post-Workout Reward Moments

This delta adds the post-workout celebration layer requested in the original Crownstorm feature plan without putting gamification inside active set logging.

## Added

- workout-complete XP moment
- level-up moment
- rank-ascension moment
- Raizen form-unlock moment
- quest-complete moment
- achievement-unlock moment
- Stormvault-cache-earned moment
- deterministic priority ordering for stacked unlocks
- dedicated `.cs-moment-*` styling
- explicit dismiss/continue control

The moment builder is read-only with respect to training and progression. It compares before/after progression snapshots and renders what the progression engine already awarded/unlocked.

Rank-up uses the Stormvault throne Raizen art. Form unlocks use the unlocked form's canonical Raizen art.

## Validation

Crownstorm package v1.1 tests: **14/14 PASS**.

New assertions verify that:
- a Level 49 -> 50 transition with `STORMVAULT_UNLOCK` surfaces the Stormvault form;
- a newly earned cache appears in the moment queue;
- workout XP appears only after workout completion;
- the moment renderer is `.cs-*` namespaced and contains no active set-logging hooks.

## Delta reconstruction

Concatenate the two `v1-to-v1.1.patch.gz.b64.*` chunks, decode, gunzip and apply to the v1 source package.

Patch SHA-256: `2a00b7579f00fd645a6498c1ccc1c6af141f2b248b0bfaedbf9718516e43b404`

Gzip SHA-256: `8fef1b2d6dd4ab6b652a2f2ff306af4a9f3b705b638be7f0ff6073fd98d57163`

Base64 payload SHA-256: `860bda1ed151ebbe2d4f816ccf9f1cf509ef806629730a2da40c8e434c33f81a`
