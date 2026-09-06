# Current LetMeFly Source Archive

Current audited rebuild: **V5_2**

- Google Drive file ID: `1JqvjI6vhHRLWlEhN136EdA2Nffrl9Gju`
- Drive filename: `LETMEFLY_REBUILT_SOURCE_V5_2.zip`
- SHA-256: `24ff93eb5f1fbd83148325b6de4b13030175e44f2e9d6381d7b113b976af9c91`
- Local package version inside archive: `5.2.0-rebuild.1`

This Drive archive supersedes the earlier V5 and V5_1 source archives.

## Why this pointer exists

The original LetMeFly source was previously lost across chat/runtime boundaries. The exact current source archive is therefore persisted outside the temporary runtime and identified by checksum before further work proceeds.

## Current audit state

- Rebuild architecture audit: PASS WITH OPEN INTEGRATION ITEMS
- Crownforge Week 1 source audit: PASS
- Crownforge Week 2 source audit: PASS
- Week 1 regression audit after Week 2 import: PASS
- `src/data/programs.ts` strict TypeScript check: PASS
- Source/security static audit: PASS
- Crownforge structured source coverage: Weeks 1–2
- Crownforge Weeks 3–14: intentionally not extrapolated; import one governed week at a time
- Real npm/Vite production build: still requires a networked build environment
- Netlify production deploy: not yet completed

Do not deploy the older V5 or V5_1 archive as though it were current. Use V5_2 or a later checksum-recorded archive.
