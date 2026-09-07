# Crownforge v2.1 Program-Data Overlay

This overlay upgrades the immutable LetMeFly V5.4 source into the modular program-package architecture without modifying the separately maintained Command V2 / Cloudinary UI layers.

## Architecture

- `src/program-engine/` contains reusable program types/builders only.
- `src/programs/crownforge/` owns Crownforge v2.1 Weeks 1-14 and its governance rules.
- `src/programs/crown-maintenance/` owns the separate mandatory 3-week bridge.
- `src/programs/black-crown/` is an independent catalog-only package until its detailed source is intentionally imported.
- `src/programs/registry.ts` handles cross-program lookup and contains no workout prescriptions.
- `src/data/programs.ts` remains a compatibility facade only; it contains no workout prescriptions.

## Transport integrity

The source patch is gzip-compressed, base64-encoded, and split into 11 transport chunks (`source.patch.gz.b64.00` through `.10`). Chunks 08-10 are whitespace-normalized base64 text; base64 whitespace does not alter the decoded gzip payload.

Expected reconstructed values:

- Base64 transport size: `81978` bytes
- Base64 transport SHA-256: `275cd158b8c207f5ad8675fb1a4ff73b7889046a15ce3eddcda901a512a50800`
- Gzip payload size: `60857` bytes
- Gzip SHA-256: `6dc0048164f10d6a78bcd6be0867d30bb1f63707f03d02b8732d7a373fc5b210`
- Expanded patch size: `329460` bytes
- Expanded patch SHA-256: `59e5b6041844abccf632134ce903947b36a58eebaca62a0e3adbe818adcef712`

The CI build must verify all three layers before applying the patch to `.build-src/letmefly_app`, and must apply this program-data overlay before any UI overlay.

## Program invariants protected by audits

- Crownforge remains 14 weeks / 98 calendar days.
- Crown Maintenance remains a separate 3-week / 15-session bridge.
- Week 10 Day 6 contains exactly one `160 lb x 2-3` Bench exposure.
- Week 12 remains the true deload; its valid 170-lb Rack Pull is not rejected by an arbitrary global load ceiling.
- Weeks 13-14 use governed testing rather than invented max numbers.
- Maintenance percentage work resolves from verified post-test lift references.
- Black Crown entry remains 90% normal / 87.5% Yellow / Red delay.
- All programmed exercise display names must resolve through the Exercise Intelligence Library.
