# Crownstorm UI v1.3 — Vault Reveal, Return Briefing, Collection Metrics + Feedback

This delta finishes the interaction/polish items that were still deferred after v1.2 while keeping the Crownstorm subsystem isolated from normal LetMeFly Home and active Workout Mode.

## Added

### Stormvault cache reveal

- cache opening now produces a dedicated reward-reveal overlay
- Epic/Legendary results receive a stronger visual treatment
- cosmetic grants can show their canonical Crownstorm/Raizen art
- duplicate conversions are labeled clearly
- the result has an explicit `CLAIM & CONTINUE` action
- cache opening remains deterministic and replay safe

### Haptics / sound adapter

- optional feedback adapter for cache opens, purchases, equips, level/rank/form/quest/achievement events
- safe silent adapter is the default
- haptics and sound are independently gated by preferences supplied by the host
- no sound/haptic dependency can block the UI

### Return briefing

The Crownstorm Hub can now show `Since Last Visit` using already-earned unlock history. No synthetic activity is invented.

### Optional season card

A season path appears only when a real season provider supplies one. There is no fake default season.

### Collection completion

Profile now summarizes:

- unlocked forms
- owned cosmetics
- caches opened
- collection completion percentage

### Controller refinements

- fixed the cache icon route hook to use the same router contract as the rest of the subsystem
- cache reveal can be dismissed explicitly
- cosmetic purchase/equip emits optional feedback only when state actually changed

## CSS / accessibility

- all additions remain `.cs-*` namespaced
- cache reveal is a proper modal-style dialog surface
- responsive narrow-phone layout included
- `prefers-reduced-motion` disables reveal animation

## Validation

Crownstorm package v1.3 tests: **21/21 PASS**.

New tests verify:

- cache reveal uses canonical art and contains no training controls
- feedback obeys sound/haptic settings
- collection metrics ignore invalid/non-catalog IDs
- season UI is absent unless a real season is supplied
- v1.2 -> v1.3 patch applies cleanly and the reconstructed package passes all 21 tests

## Delta checksums

Patch SHA-256: `ec28db1eb69b19500215587a51310c82a79739317f632d4977f85cddb84a3a0a`

Gzip SHA-256: `70191f28d1202ec10202b0dbc1087dee1dd1615151cf6a404ea912995e05e8c0`

Base64 payload SHA-256: `79e51d1ed15acfa972f65d7fe04172ab5221ca18c0c27b6d370166ba0a71ea5d`
