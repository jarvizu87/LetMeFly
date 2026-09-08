# Crownstorm UI v1 Source Package

The complete tested TypeScript implementation is stored in six ordered base64 chunks under `source/`.

## Reconstruct

```bash
cat source/source.tar.gz.b64.* | tr -d '\n' | base64 -d > crownstorm-ui-v1-source.tar.gz
sha256sum crownstorm-ui-v1-source.tar.gz
# expected: 89c8a00398c06fe6aec11746b1be54b8c5d95c13360ae29b82e0b86aab4562a6

tar -xzf crownstorm-ui-v1-source.tar.gz
cd crownstorm-ui-v1
npm test
```

Base64 payload SHA-256:

`c7e452959ac371cad9f65c0ae6216ef74cdc3b4ffc0b71575a15b8ed2d5408f6`

## Validation before packaging

- TypeScript build: PASS
- automated tests: 12/12 PASS
- Home dashboard selectors/modifications: none
- private `localStorage` persistence: none
- cache replay/idempotency: PASS
- duplicate cosmetic conversion: PASS
- locked-form equip protection: PASS
- LIVE visibility fail-closed: PASS
- Quest-screen namespace/style checks: PASS
- Stormvault-throne Rank hero check: PASS

## Package contents

- typed Crownstorm domain model
- form/rank/reward/art catalogs
- deterministic Stormvault cache economy
- milestone-to-cache event policy
- quest policy
- collection/equip logic
- private IndexedDB UI store
- UI preferences
- More-entry visibility gate
- Crownstorm controller/router
- Hub, Quests, Evolution, Rank & Rewards, Profile, Stormvault, Titles, Journey, Achievements and Caches renderers
- fully `.cs-*` namespaced CSS
- integration/docs/test suite
