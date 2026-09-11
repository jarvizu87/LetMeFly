# Priority B delivery

Tracking: #73, with thumbnails #69, Progress #70, athlete-aware Coach #71, and Training Intelligence integration #72.

Core PRs #43, #63, #66 and #68 were merged first; combined main passed. The #74 merge also passed its main build, cloud and deployment-policy checks. PR #74 added the first integrated Progress and Coach batch in `overlays/athlete-insights-v1`, with calculation tests and disposable-browser QA. No production release is included.

Progress adds actual session lifting volume, exercise history, explicit missing-data handling, equal rolling-window comparisons and an accessible session chart/table within the existing Strength tab. Coach adds current program, completed history, latest scored readiness, exercise context and explicitly selected conditional Training Intelligence source rules. Rules remain review-only; no prescription or program mutations are made.

The recovered v1.9R5 decision manifest records source provenance and STANDBY state. Current governed app programs remain authoritative. A recorded source hash is provenance metadata, not independent source authentication.

`node --test ci/audit-athlete-insights.mjs` validates calculation boundaries. `ci/audit-athlete-insights-browser.mjs` uses disposable athletes, loopback-only requests, mobile/desktop viewports and source/outbox immutability checks. The full build workflow runs the browser check with Programs-tab order verification.

Thumbnail reconciliation remains separately tracked in #69. Raw private registries, asset IDs and delivery mappings are excluded from the repository.

The next Coach batch reads saved goals, training background, preferences, equipment and coaching notes from the active athlete profile. It makes missing context explicit and links to the existing profile editor. Cleared fields remain blank, legacy fields provide compatible fallbacks, and profile text is rendered literally. The browser audit covers native profile save, Coach reload and unchanged source/outbox snapshots during read-only views. This does not seed or fill a real athlete profile.
