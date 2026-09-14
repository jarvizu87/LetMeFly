# PWA Update Control v1 acceptance

A release containing this change is acceptable only when all of the following are true:

- The production shell contains `/ui/pwa-update-v1.js?v=1`.
- Settings exposes **App updates** with **CHECK NOW**.
- A newer service worker can surface **UPDATE NOW** / **RELOAD NOW** without uninstalling the PWA.
- `service-worker.js` contains a per-release `LMF_RELEASE_TOKEN` so distinct deploys are detectable.
- The update controller is in `PRECACHE` for installed/offline shell use.
- The service worker supports `skipWaiting()` and `clients.claim()`.
- The update controller never clears localStorage, IndexedDB, workout history, profile data, or private athlete vault data.
- The existing `/refresh.html` recovery utility remains separate and unchanged in purpose.
- Command V2, Seven-Athlete, cloud-sync, and normal release gates remain green.

Existing pre-v1 installed clients may need one close/reopen or reload after this corrective release. After v1 is installed, future releases should be discoverable and activatable from inside LetMeFly.
