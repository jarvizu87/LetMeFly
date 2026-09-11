# Athlete exercise art

Exercise art is a presentation layer. Runtime lookup never changes programs, prescriptions, workout data, profile fields or the outbox. The legacy resolver filename remains stable for installed app shells; it no longer delivers Cloudinary URLs.

## Selection and approval

The native `LetMeFlyExerciseArt` version 2 bridge uses the application's `getActiveAthlete()`, Auth and Storage clients. Cloud lookup verifies the signed-in user, checks ownership of that exact athlete and reads approved, active, nondeleted `exercise_thumbnail_overrides` through RLS. Tokens are neither scanned from unrelated localStorage nor exposed by the bridge.

Each accepted row has an immutable id, an exact exercise key and `metadata.delivery`:

```json
{
  "kind": "supabase-private",
  "bucket": "athlete-exercise-art",
  "parts": [{ "path": "<athlete UUID>/<64-character SHA-256>.webp", "label": "Exercise name" }]
}
```

The placeholder example is illustrative, not an import. Paths must belong to the exact active athlete and end in a 64-character lowercase hex digest plus `.webp` or `.png`. One part represents one reviewed image; two distinct parts represent an explicitly reviewed compound. Each component has its own visible label and contained image. No component is silently substituted for the whole exercise. Candidate, malformed and duplicate exact keys remain inactive, including an otherwise valid row duplicated by a malformed approved row.

## Authenticated byte delivery

`readAsset(athleteId, exerciseKey, overrideId, path)` only accepts references issued by the current approved cloud lookup. It checks trusted native authentication and ownership again, reloads the exact key to reject revoked, changed or duplicated approval, then calls the native client's private Storage `download` method. It verifies the resulting Blob's MIME, extension and size before returning bytes. No bearer tokens, signed URLs or service credentials are exposed. The `athlete-exercise-art` bucket must remain private with owner-based RLS; the backend policy is documented separately in `backend/private-exercise-art.sql`.

The presentation layer renders revocable in-memory blob URLs after both dimensions pass the 640px quality floor. Auth/athlete changes, refreshed mappings, page exit and lost connectivity clear images and revoke those URLs. Stale download and image callbacks cannot activate after context changes. Reused workout DOM nodes clear their previous exercise. Failed, offline, low-resolution and unapproved images keep the mountain fallback. Private image bytes are not added to app-shell service-worker caches or public build artifacts.

The runtime is read-only. The owner-scoped schema is applied. Image-byte upload and override activation remain pending explicit approval of the image payload and Supabase destination after automatic approval review rejected the transfer. Implementing this resolver does not authorize or perform that transfer. Prior public Cloudinary copies must be assessed during the intentional migration/cutover: this runtime does not make historical public copies private.

## Legacy local mappings

Local maps remain under `privateExerciseArtMap:<athleteId>` with a version 2 athlete-bound envelope. The importer can preserve a reviewed legacy map as a migration reference, using explicit confirmation and an atomic comparison of the athlete and previously saved map. It clearly states that saving a legacy map cannot activate public image links. No directory, filename or legacy local approval implies approval of replacement private image bytes.

## Verification

`ci/audit-exercise-art.mjs` covers private paths, approval, duplicates, legacy imports and the actual native bridge's exact-reference download, trusted authentication, ownership, revocation and MIME checks. `ci/audit-exercise-art-browser.mjs` checks the compiled bridge and mobile/desktop fixtures with real Blob/image decoding, stale downloads, URL revocation, low-resolution fallback, separately labeled compound images, absence of public image requests, storage immutability and legacy import review. Fixture images do not constitute artwork/source approval. Real owner-authenticated Storage delivery is a separate deployment acceptance check once approved bytes and rows are staged.
