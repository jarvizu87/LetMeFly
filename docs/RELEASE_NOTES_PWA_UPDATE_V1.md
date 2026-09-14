# Release note — PWA update control v1

This corrective shell release adds an in-app update path for installed LetMeFly PWAs. It does not change Crownforge, Crown Maintenance, Black Crown, workout prescriptions, athlete profile data, or private workout history.

The app now checks for service-worker updates automatically and exposes a manual **App updates** control in Settings. When a newer build is detected, the athlete can activate it with **UPDATE NOW** and reload into the new shell. Each deployed commit stamps the service worker with a release token so future production releases are byte-distinct and reliably discoverable.

The change is intentionally cache/shell-only. No localStorage clearing, IndexedDB deletion, or private-vault migration is performed by the update controller.
