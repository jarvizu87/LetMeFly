# LetMeFly Exercise Artwork

LetMeFly currently supports two intentional exercise-art paths. Do not rename assets from one convention into the other without also changing the resolver that owns that path.

## 1. Public repository drop-in artwork

Approved public app-shell artwork may be placed in this overlay using the exercise display name converted to lowercase kebab-case:

- `Push Press` → `push-press.webp`
- `Serratus Wall Slide` → `serratus-wall-slide.webp`
- `T-Spine Rotation` → `t-spine-rotation.webp`
- `Wrist Flexor/Extensor Pulses` → `wrist-flexor-extensor-pulses.webp`
- `Band Pull-Apart` → `band-pull-apart.webp`
- `Cable Press-Around` → `cable-press-around.webp`
- `Rear Delt Fly` → `rear-delt-fly.webp`
- `Rope Pushdown` → `rope-pushdown.webp`
- `Scap Push-Up` → `scap-push-up.webp`

Supported extensions: `.webp`, `.png`, `.jpg`, `.jpeg`.

Keep one public image per slug. WebP is preferred.

## 2. Approved private JP exercise artwork

Existing approved masters may retain the legacy `jp-${slug}-v2` naming convention. Do not bulk rename them. The convention remains an audit/reference marker; it no longer grants runtime approval or implies an athlete mapping.

Private art uses exact reviewed mappings scoped to the active athlete. See [delivery and migration rules](../../docs/CLOUDINARY_EXERCISE_ART.md). Global legacy maps and prefixes remain stored but need an explicitly reviewed athlete-bound import. Unmapped exercises retain the themed fallback.

## Privacy boundary

Artwork that ships as a public app-shell asset is public. Athlete profile data, private storage identifiers, authenticated override records, and private credentials must remain outside the public repository.
