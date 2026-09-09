# LetMeFly Official Brand v2

The user-approved 1536×1536 source remains the authoritative provenance master. Its exact SHA-256 is `2b0bb29e200fb48ade90336bc355ad26c21277ddfcbacdf245474e85f82d348b`, and the archived original remains in the private LetMeFly App Drive folder.

Production materialization uses an ICC-preserving, lossless 512×512 WebP runtime master. Its exact SHA-256 is `e130ad7f388f9caab28d43a2fef731f9719275b79b527684b0fed9d43cb54e7b`. Its decoded RGBA pixel SHA-256 is `f8a1f872d1f5fdf9a8cc0cd56f5e46e3f3e3dda20ad7d9a87a1b2183a6318c2e`, which exactly matches the approved transparent display derivative.

The runtime master is stored in the repository as seven Base64 chunks whose boundaries are divisible by four. The installer reconstructs the WebP, verifies the runtime-file SHA, and the materializer verifies dimensions, ICC presence, and the decoded-pixel SHA before generating any production asset.

The incomplete earlier gzip/Base64 transport for the 1536 source is retired and must not be used to reconstruct or infer missing source bytes.

The shipped PWA uses same-origin local brand files for the in-app display logo, launcher icons, maskable icon, Apple touch icon, and favicon. Cloudinary is not a runtime dependency for the official app brand.
