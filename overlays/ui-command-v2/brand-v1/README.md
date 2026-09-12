# LetMeFly Authoritative Brand v1

This directory locks the user-approved LetMeFly logo as the single source of truth for app branding.

## Approved source provenance

The approved 1536×1536 source artwork is identified by SHA-256 `2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b`. It contains the full bird face/beak/eye detail, kettlebell, torso, feather structure, shield, and LET ME FLY wordmark.

No redraw, simplification, recolor, alternate mascot, or legacy logo is permitted as a substitute.

The full source image is provenance, not a production runtime dependency. LetMeFly ships deterministic derivatives that were created from that approved master.

## Runtime transport

The runtime logo derivatives are stored as nine text-safe Base64 chunks under `transport/brand-icons-q256-v1.tar.gz.b64.00` through `.08`. `ci/extract-authoritative-brand-v1.sh` concatenates and decodes those chunks, verifies gzip/tar integrity, then refuses to continue unless every reconstructed image matches its locked SHA-256.

This text transport replaces the earlier binary `official-brand-assets-v1.tar.gz`, which was corrupted by repository transport and is intentionally retired.

## Shipped derivatives

- `letmefly-app-icon-192-v1.png` — standard PWA/launcher icon
- `letmefly-app-icon-512-v1.png` — high-resolution app/brand icon and More-tab logo
- `letmefly-app-icon-512-maskable-v1.png` — Android maskable icon with safe padding

The production installer verifies exact SHA-256 hashes before copying any of these assets into the final distribution.

## Production rule

`ci/install-home-reference-v3.sh` is the active final brand layer. It installs the verified local assets, creates compatibility SVG wrappers for existing app references, updates the PWA manifest, preserves non-brand service-worker precache entries, and rejects known legacy broken logo URLs.

## Integration boundary

This package is branding-only. It must layer onto the current production app without changing governed program prescriptions, workout persistence, mobile workout scrolling, private athlete data, Home/Progress route behavior, or other non-brand feature contracts.
