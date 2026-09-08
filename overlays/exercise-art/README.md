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

The current private-art/Cloudinary resolver intentionally supports the locked-JP asset convention:

`jp-${slug}-v2`

Examples:

- `Push Press` → `jp-push-press-v2.webp`
- `Front Squat` → `jp-front-squat-v2.webp`
- `Cable Press-Around` → `jp-cable-press-around-v2.webp`

These filenames are **not an error** and should not be bulk-renamed to the public drop-in convention. The production build explicitly audits for the `jp-${slug}-v2` resolver behavior.

Private approved art is resolved through the governed private-art mapping/Cloudinary layer. It must not require a private athlete profile or private credentials to be committed into the public repository.

## Privacy boundary

Artwork that ships as a public app-shell asset is public. Athlete profile data, private storage identifiers, authenticated override records, and private credentials must remain outside the public repository.
