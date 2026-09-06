# Current LetMeFly Source Archive

Current audited rebuild: **V5_1**

- Google Drive file ID: `1LqmZZj-2OCkbxgHcdE6DGy94DK4uogLx`
- Drive filename: `LETMEFLY_REBUILT_SOURCE_V5_1.zip`
- SHA-256: `589270ec29b0eb2140fc745002387bef9dd9f2b183eef2f3743280d9d01d46be`
- Local package version inside archive: `5.0.0-rebuild.2`

This Drive archive supersedes the older `source/LETMEFLY_REBUILT_SOURCE_V5.zip` binary currently stored in this repository.

## Why this pointer exists

The original LetMeFly source was previously lost across chat/runtime boundaries. The exact current source archive is therefore persisted outside the temporary runtime and identified by checksum before further work proceeds.

## Current audit state

- Rebuild architecture audit: PASS WITH OPEN INTEGRATION ITEMS
- Crownforge Week 1 source audit: PASS
- Source/security static audit: PASS
- Real npm/Vite production build: still requires a networked build environment
- Netlify production deploy: not yet completed

Do not deploy the older V5 archive as though it were current. Use V5_1 or a later checksum-recorded archive.
