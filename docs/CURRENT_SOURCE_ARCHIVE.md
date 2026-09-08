# Current LetMeFly Source Archive

## Production reconstruction base

The current GitHub build reconstructs the application from the repository-owned immutable base archive:

- Path: `source/LETMEFLY_REBUILT_SOURCE_V5_4_UI_COMMAND_B4.zip`
- Expected archive size: `154947` bytes
- Expected SHA-256: `514c538a9442d5c12c534a914f79c7f1988f2a416077b72bc5e9fafbd4ef89d4`

`ci/build-command-v2.sh` verifies that size and checksum, expands the archive into `.build-src/letmefly_app`, and verifies the package manifest before applying governed program-data and UI overlays.

This repository archive is a **build base**, not the final assembled production source by itself.

## Governed overlay state

The current reconstruction pipeline applies the Crownforge v2.1 modular program-data overlay before the UI overlays.

Current program-data status:

- Crownforge Weeks 1–14: structured modular package.
- Crown Maintenance Weeks 1–3: separate structured modular package.
- Black Crown: independent package, detailed 54-week prescriptions still catalog-only pending intentional source import.
- Program registry/facade: lookup/compatibility only; prescriptions belong to packages.

The current build then applies the Command V2, mobile, readiness, exercise-art, Cloudinary/private-art resolution, and related hardened presentation/runtime layers before running release audits and the Vite build.

## Historical Drive backup

A previous audited rebuild archive is retained as a recovery artifact:

- Drive file ID: `1z-Uf5V0TyezuN_cGGgMbp4cMBng1h5cM`
- Filename: `LETMEFLY_REBUILT_SOURCE_V5_4.zip`
- Historical SHA-256: `48aa4bde71f768d77aa8ba916d53c29c756d31896d6386a2c3cf23831d2492a7`
- Historical size: `135242` bytes

It has been moved out of My Drive root into the LetMeFly project archive under **Archive / Source Code Backups**.

That Drive ZIP is a historical recovery backup. It does **not** supersede the newer repository reconstruction base plus audited overlays.

## Source-of-truth rule

For current application behavior, use:

1. The current GitHub reconstruction pipeline and audited program-data overlays.
2. The approved governing human-readable program sources for intentional source corrections/imports.
3. Historical Drive source ZIPs only for recovery/comparison.

Do not deploy or restore an older V5.x archive as though it were the complete current application without reapplying the current governed overlays and audits.
