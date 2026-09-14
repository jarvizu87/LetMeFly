# LetMeFly PWA Update Control v1

## Purpose

Installed LetMeFly PWAs need an explicit, athlete-safe way to discover and activate new production releases without uninstalling the app or clearing the private athlete vault.

## Behavior

- Adds an **App updates** control to the existing Settings list with **CHECK NOW** / **UPDATE NOW** / **RELOAD NOW** states.
- Checks for a new service worker on app visibility, reconnect, startup, and a 30-minute interval.
- Shows a global update-ready banner when a new build is available.
- Activates a waiting worker through the `LMF_SKIP_WAITING` message and reloads only when the athlete chooses the update action.
- Gives each deployed commit a release token inside `service-worker.js`, guaranteeing that separate releases are byte-distinct and discoverable by the browser.
- Precaches `/ui/pwa-update-v1.js` for installed/offline shell use.

## Data safety

The update controller does **not** clear localStorage, IndexedDB, Cache Storage, workout history, profile data, program position, TMs, readiness, or PR history. The existing `/refresh.html` utility remains a separate recovery tool for obsolete app-shell caches.

## First rollout note

Devices already running a pre-v1 LetMeFly service worker do not yet have the in-app update controller. The v1 service worker uses `skipWaiting()` plus `clients.claim()` so the corrective release can take control without an uninstall. A close/reopen or reload may be needed once on those existing installations to render the new update UI. Future releases can then be handled from inside LetMeFly.
