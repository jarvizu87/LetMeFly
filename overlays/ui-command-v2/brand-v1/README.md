# LetMeFly Authoritative Brand v1

This directory locks the user-approved LetMeFly logo as the single source of truth for app branding.

## Source of truth

`letmefly-official-master-source-v1.jpg` inside `official-brand-assets-v1.tar.gz` is a byte-for-byte copy of the user-approved 1536×1536 artwork supplied on 2026-09-08. It contains the full bird face/beak/eye detail, kettlebell, torso, feather structure, shield, and LET ME FLY wordmark.

No redraw, simplification, recolor, alternate mascot, or legacy logo is permitted as a substitute.

## Shipped derivatives

The archive contains deterministic raster derivatives made only by crop/resize/pad from that master:

- `letmefly-app-icon-192-v1.png` — standard PWA/launcher icon
- `letmefly-app-icon-512-v1.png` — high-resolution app/brand icon
- `letmefly-app-icon-512-maskable-v1.png` — Android maskable icon with safe padding

The production installer verifies SHA-256 hashes before copying any of these assets into the final distribution.

## Production rule

`ci/install-home-reference-v3.sh` is the active final brand layer. It installs these local assets, creates compatibility SVG wrappers for existing app references, updates the PWA manifest, preserves non-brand service-worker precache entries, and rejects known legacy broken logo URLs.
