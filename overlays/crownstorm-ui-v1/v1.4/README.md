# Crownstorm UI v1.4 — Titles, Safekeeping, Settings + Vault History

This delta completes the remaining collection/settings surfaces while keeping Crownstorm isolated from normal LetMeFly Home and active Workout Mode.

## Added

### Titles

- locked / unlocked / equipped states
- equip actions only for earned titles
- title state reads actual `snapshot.earnedTitles`
- locked titles remain visible as future goals without becoming selectable

### Safekeeping Collection

A dedicated collection surface now shows only:

- unlocked Raizen forms
- owned frames
- owned auras
- owned banners
- earned badges / emblems / cosmetics

No unearned reward is presented as owned.

### Crownstorm Settings

Presentation-only controls for:

- reduced motion
- sound
- haptics
- cinematic art
- Stormvault cache-opening animation

These preferences do not affect workouts, readiness, XP rules, progression, or programming.

### Stormvault room routing

- Recovery Hall -> Achievements
- Audit Chamber -> Journey
- Safekeeping Vault -> Collection
- Conversion Forge -> direct cosmetic exchange
- Release Gate -> Journey
- Crownward -> Collection

### Cache history

Opened Stormvault Caches remain visible as a read-only Vault history. Historical cache results are not rerolled or rewritten.

## Validation

Crownstorm package v1.4 tests: **26/26 PASS**.

New tests verify:

- title locked/unlocked/equipped behavior
- Safekeeping shows owned rewards and unlocked forms only
- settings defaults remain presentation-only
- opened cache history is read-only
- Stormvault rooms route to the intended subsystem surfaces
- v1.3 -> v1.4 patch reconstructs the source package exactly (excluding generated `dist/`)

## Delta checksums

Patch SHA-256: `6fd36214cbe9b6784d20781f465347d36d86388f1a938f65e9cd0403f10e9c97`

Gzip SHA-256: `622612197508d9a3e4636cf6e391d643368e650b4a07e3dc03f49a8678640c17`

Base64 payload SHA-256: `eea7ede993c8244f91b4b49c52c98c4e13d6405470ff43ffa5801b2c5935743a`
