# Athlete exercise art

Exercise art is a presentation layer. Runtime lookup never changes programs, prescriptions, workout data, profile fields or the outbox.

## Selection and approval

The native `LetMeFlyExerciseArt` bridge uses the same `getActiveAthlete()` and Supabase Auth client as the app. Cloud lookup verifies the signed-in user, checks ownership of that exact athlete and reads its approved, active, nondeleted `exercise_thumbnail_overrides` through RLS. Tokens are not scanned from unrelated localStorage entries or exposed through the bridge.

Local maps use the meta key `privateExerciseArtMap:<athleteId>` with an envelope containing `formatVersion: 2`, `athleteId` and `overrides`. Each exact exercise key needs a validated `publicId`, supported image `format`, and explicit `status: approved`. Candidate and malformed entries cannot activate. Duplicate cloud keys are withheld. Cloud mappings take precedence over local mappings.

The importer previews the target athlete and count before explicit confirmation. Saving compares the reviewed map and active athlete inside one transaction. Legacy unscoped maps and folder settings remain stored but inactive. A version1 file can be assigned through the reviewed import flow only when every entry explicitly records approval. No directory or filename convention implies approval.

Missing mappings, low-resolution or failed images, and unresolved compound exercises retain the themed mountain fallback. A compound exercise needs its own reviewed representation; it must never silently resolve to only one of its components.

## Lifecycle

Auth changes, athlete changes, map imports, focus/resume and connectivity trigger a fresh lookup. Old image callbacks and results cannot activate after the context changes. A reused workout DOM node is cleared when its exercise key changes. Lookup is read-only; the importer writes only the selected athlete's map in meta.

## Delivery boundary

Supabase RLS protects cloud mapping lookup. It does **not** protect Cloudinary image bytes delivered with public `image/upload` URLs. A folder called `private` is not authenticated delivery. This runtime contains no athlete-specific prefix or mapping, but changing existing asset visibility or introducing signed authenticated delivery remains separate work. No service credential belongs in the browser. Private mapping files and athlete identifiers must remain outside this public repository.

## Verification

`ci/audit-exercise-art.mjs` checks approval, path and identity rules. `ci/audit-exercise-art-browser.mjs` checks the compiled native bridge and runs isolated mobile/desktop fixtures for athlete switching, stale callbacks, cloud filtering, logout cleanup, compound fallback, storage immutability and the import review flow. CI runs both along with the existing app and program audits.
