# LetMeFly Rebuild Audit

Audit date: 2026-09-05
Status: **PASS WITH OPEN INTEGRATION ITEMS**

## Automated checks passed

- strict TypeScript check of the reconstructed source using a temporary audit declaration for the unavailable local Supabase npm package
- pure Crownforge/program-data test
- pure barbell loader test including a non-45-lb bar
- source/security static audit (`npm run audit:source` logic executed directly)
- 7 Crownforge opening-week calendar days present
- 101 opening-week exercise instances validated with non-empty prescriptions
- no private app-data writes to localStorage
- no hard-coded JP/private athlete identity in the application source
- no service-role/database/admin credential in the public source
- service worker bypasses Supabase/auth/private API traffic
- CSP keeps JavaScript `script-src` self-only
- Black Crown remains catalog-only instead of being fabricated

## Problems found during this reconstruction audit and fixed

### 1. Pre-restore safety backup was verified but not persisted
Severity: High recovery correctness

The Stage 11 reference created a verified pre-destructive backup in memory but discarded it before replacement. The rebuilt source now saves the complete verified backup into `internalBackups` with reason `pre-restore`, and the restore transaction intentionally does not clear that store.

### 2. Portable import carried historical cloud device records
Severity: Medium

A portable import should be independent of the old cloud/device relationship. The rebuilt restore path now drops old `devices` domain records and creates a fresh current local device state; the normal account bootstrap registers the new cloud device later.

### 3. Workout startup was not one atomic transaction
Severity: High local reliability

The original reference created session/exercises/sets in many transactions. A crash could leave a partial session that later looked like an existing workout. The rebuilt source creates the complete workout skeleton plus outbox mutations in one multi-store IndexedDB transaction.

### 4. Onboarding could partially create profile/program records
Severity: Medium

Athlete, preferences, program enrollment, and their outbox records now commit in one IndexedDB transaction.

### 5. Readiness soreness/stress scale was inverted twice
Severity: Medium coaching correctness

The UI now stores straightforward 1–5 values: sleep/energy 1 low to 5 high; soreness/stress 1 low to 5 high. Readiness scoring performs the inversion exactly once when calculating readiness quality.

### 6. Barbell helper displayed “45 lb bar” even for custom bars
Severity: Low

The display now uses the selected/calculated bar weight.

### 7. Workout completion could hide intentionally incomplete work
Severity: Low/Medium historical clarity

If sets remain unlogged, the app now confirms before completing the workout and leaves skipped sets accurately incomplete in history.

### 8. CSP blocked the rebuild's inline style attributes
Severity: UI/runtime

Scripts remain self-only. `style-src` now permits inline styles because the current generated UI uses safe style attributes for presentation/progress widths. This does not permit inline JavaScript.

## Private-data boundary audit

PASS

- IndexedDB `letmefly-private` is the private athlete database.
- Auth persistence uses a separate `letmefly-auth` IndexedDB store.
- legacy localStorage is read only by the migration layer and is never automatically deleted.
- public source has no personal profile/TM/bodyweight/history seed.
- service worker is not the private database.

## Program-logic audit

PASS WITH SOURCE-COVERAGE LIMITATION

- Crownforge v2.1 governance is represented.
- exact/percentage/TM prescription is treated as authority, not RPE-driven random loading.
- completed workouts snapshot the prescription and are not rewritten by later program updates.
- substitution guidance preserves training role rather than matching by muscle alone.
- remaining Crownforge/Black Crown program weeks are not invented.

See `docs/SOURCE_COVERAGE.md`.

## Build audit limitation

The execution environment could not complete `npm install` within multiple network timeouts. Therefore I am **not** claiming that a Vite production bundle was built from freshly downloaded npm package bytes in this session.

The reconstructed source itself passed strict TypeScript checking against the documented Supabase API surface using the temporary audit declaration. The final source package does not depend on that declaration; after `npm install`, it should typecheck against the pinned real packages.

## Still required before real-athlete cloud bootstrap

- run `npm install && npm run build` in a normal networked source/deploy environment
- browser smoke test on phone and desktop
- installed PWA cold-launch offline test
- run legacy migration against the actual existing browser data and inspect unmapped fields
- download/verify a real athlete JSON backup
- test real OTP with a synthetic account from the rebuilt UI
- test local -> cloud bootstrap using synthetic athlete data
- test new-device cloud -> local hydration
- render and resolve a live same-set conflict in the UI
- source-to-data comparison for medium-confidence Week 1 support loads
- import the remaining Crownforge source before Week 2
- import the complete Black Crown source before Black Crown begins
- replace placeholder app icons with the final LetMeFly brand assets when available

## Verdict

The lost **application source architecture** has been successfully reconstructed and Stage 15 is no longer blocked by having no editable source package.

Real-athlete production deployment remains gated by the browser/build/source-data checks above, not by missing architecture.
