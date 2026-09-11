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
- Five final aliases bring the active lookup total to 227, still referencing the original 163 images. No new bytes were uploaded for these cases.
- Machine Hip Abduction has a dedicated reviewed illustration ready. Automatic approval review rejected its upload because it requires explicit approval of that new image payload and the existing private Supabase destination. The new image remains unuploaded and unmapped; its temporary transfer endpoint was closed. Finish that approval and verify delivery before declaring the library complete or publishing the final batch.
- Three non-exercise entries—verified Crownforge results, Black Crown entry TM rules, and full rest—intentionally have no exercise thumbnail.

Actual physical-phone acceptance is separate from browser verification. No workout, readiness, profile, training-max or progression data is changed by this follow-up.
