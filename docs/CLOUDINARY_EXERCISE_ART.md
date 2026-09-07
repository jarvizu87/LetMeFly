# LetMeFly Cloudinary Exercise Artwork

## Folder model

Exercise artwork is organized by ownership, never by program day/week/phase.

- `letmefly/app/exercises/mine` — JP/LetMeFly custom exercise artwork.
- `letmefly/app/exercises/others` — generic workout-photo buffers used only until a matching custom image exists.
- `letmefly/inbox/unmapped` — uploads that have not been safely identified yet.

Do not create Crownforge Day/Week folders or Black Crown phase folders for exercise art. A single exercise image is reusable everywhere the canonical movement appears.

## Canonical naming

Every image must use the same stable slug generated from the exercise name, for example:

- `front-squat`
- `bench-press`
- `push-press`
- `serratus-wall-slide`
- `kb-front-rack-carry`

The runtime lookup order is:

1. `letmefly/app/exercises/mine/<exercise-slug>`
2. `letmefly/app/exercises/others/<exercise-slug>`
3. bundled real workout/lifter photograph

This means adding a correctly named custom image automatically replaces the generic buffer everywhere that exercise is used without changing Crownforge or Black Crown programming.

## Cloudinary public IDs

The application resolves Cloudinary delivery URLs by public ID. The asset folder alone is not sufficient if Cloudinary is configured with decoupled dynamic folders.

For every exercise asset, keep the public ID aligned to the logical folder path:

- custom: `letmefly/app/exercises/mine/<exercise-slug>`
- generic: `letmefly/app/exercises/others/<exercise-slug>`

When uploading, use the asset-folder path as the public-ID prefix, or explicitly rename the public ID after upload. Do not leave production exercise art with anonymous IDs such as phone-generated numeric filenames.

## Image fidelity

The app requests Cloudinary artwork with:

`c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best`

Rules:

- `c_lfill` preserves the source aspect ratio and does not upscale a smaller source image.
- `g_auto` keeps the important subject in frame when cropping.
- CSS uses `background-size: cover`, which crops rather than stretches.
- No blur filter is applied.
- Prefer source images at least 1024×1024; 1254×1254 or larger is ideal for Galaxy Ultra screens.
- Do not stretch a landscape/portrait source into a square manually before upload.

## Safety boundary

Artwork changes must never rewrite exercises, sets, reps, loads, week structure, substitutions, or progression rules. The image layer is presentation-only.
