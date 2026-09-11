# Private artwork sync compatibility

The released native sync client has a fixed set of IndexedDB domain entities. Artwork metadata is delivered separately by the authenticated private-art bridge. Activating approved thumbnail rows also emitted `exercise_thumbnail_overrides` events into `sync_changes`; those events stopped cloud bootstrap and normal sync with `Unknown entity exercise_thumbnail_overrides`.

## Database correction

Applied migration `20260911212907_exercise_art_sync_compatibility` adds the restrictive SELECT policy in `database/exercise-art-sync-compatibility.sql`. It excludes artwork events from authenticated domain-sync reads. The existing permissive athlete-ownership policy is still required. No rows, profiles, workout history, training maxes, storage objects, or sync cursors are edited by the migration. Administrative audit events remain intact.

This is compatible with the released app and older clients; no additional Netlify publication is required. Later domain events remain readable because the client queries monotonically increasing sequence numbers, without requiring contiguous numbers.

The rollback is to drop only `sync_changes_domain_feed_only`, after deploying a client that can safely handle the artwork event type. Doing so before that client exists restores the original sync error.

## Verification

`database/test-exercise-art-sync-compatibility.sql` runs inside a rolled-back transaction and verifies:

- Existing owners receive every domain event while artwork events are excluded.
- Direct owner access to the private thumbnail mapping table remains unchanged.
- A nonowner identity and anonymous role cannot read private sync or artwork rows.
- Stored audit rows and approved mappings are retained.

The initial test retained all 519 sync rows and all 182 artwork events/mappings. After display aliases were added, the repeated test retained 560 sync rows and all 222 artwork events/mappings. Counts were checked again after app initialization. Security advisors introduced no new findings. The pre-existing password-protection warning remains outside this change.

The real production browser recovered to **SYNCED**, retained the athlete's saved position/history/profile, and displayed private blob-backed single and paired artwork. No fabricated workout sets were logged.

## Display-key reconciliation

The current program registry has 150 distinct displayed exercise labels. The original 182 approved canonical mappings covered 101 of those raw display slugs. `database/exercise-art-display-aliases.json` records 40 reviewed aliases activated only for the approved athlete, by reusing the existing approved private assets. Abbreviations, warm-up/testing labels and two-option movements now map without changing any program prescription.

Every source was checked through the production private-art contract. All 40 aliases passed its one-or-two-part requirement. The backend now has 222 approved exact lookup keys referencing the original 163 image files. New image bytes were not introduced.

The final display-case follow-up is recorded in `database/exercise-art-final-display-cases.json`:
- Bike / Row / Walk; Walk, Bike, or Elliptical; Bike, Row, or Elliptical now have three individually approved source images. The updated renderer validates all three and presents contained images with unnumbered, readable option labels. The older production renderer retains its fallback until this code is published.
- Relaxed Breathing reuses the approved quiet seated pose without importing box-breathing timing. Generic Curl uses the approved supinated curl illustration without changing the equipment-neutral program prescription. Both exact aliases are active.
- Five final aliases bring the active lookup total to 227, referencing the original 163 images. No new bytes were needed for these cases.
- Machine Hip Abduction now has a dedicated reviewed and explicitly owner-approved illustration. The exact approved image was uploaded to the existing private bucket; the stored SHA-256 and byte count match the selected source. Its mapping is active and its temporary transfer endpoint is closed. The completed library has 228 exact mappings and 164 private images, covering all 147 exercise labels in the governed programs.
- Three non-exercise entries—verified Crownforge results, Black Crown entry TM rules, and full rest—intentionally have no exercise thumbnail.

Actual physical-phone acceptance is separate from browser verification. No workout, readiness, profile, training-max or progression data is changed by this follow-up.

## Final thumbnail release

PR #87 passed its nine checks and Netlify preview, all 10 private-art tests, and all 16 browser subaudits in [run 34652787001](https://github.com/jarvizu87/LetMeFly/actions/runs/34652787001). The merged application also passed [run 34653358605](https://github.com/jarvizu87/LetMeFly/actions/runs/34653358605). Three-option cards were checked at 412px and 1440px, including label fit, complete image delivery, missing-component fallback, native-media deduplication and logout cleanup.

The final artwork transfer occurred only after the owner explicitly approved the new image, private destination and final publication. Anonymous access, assets outside the exact transfer manifest, and altered bytes were rejected. Owner and nonowner isolation tests were repeated after all 228 mappings were active. All legacy public copies remain retired.

Publish this completed batch once through the existing intentional `[release netlify]` gate. No duplicate site, image reupload or legacy cutover is required. Device-specific physical-phone acceptance remains a separate check after publication.
