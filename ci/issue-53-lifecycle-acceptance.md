# Issue 53 lifecycle acceptance

The manual **LetMeFly Database Lifecycle Soak** workflow reconstructs the app at the selected workflow commit using `netlify.toml`, then tests its unmodified services in disposable Chromium IndexedDB. It does not deploy.

After this workflow is merged into the default branch, run it from GitHub Actions → LetMeFly Database Lifecycle Soak → Run workflow. Select the branch to verify. The resolved commit is recorded as `productionSha` in every report; this field identifies the tested build and does not imply a production release.

Five full lifecycle variants cover perfect prescriptions, athlete variation, reload/restart, grouped metrics, and substitution/history. Two additional lanes cover adversarial state and native transaction faults. Counts come from the real governed definitions. The harness fails on duplicate, orphaned or drifting state and validates program boundaries and prescriptions.

The scripts are unchanged from the harness at `1fe7d9451595012fc8418a3105f21c860eb09f8c`, used in the combined #43/#53 candidate runs. The workflow adds source-and-dist hash verification and is manual only so ordinary pushes do not start the expensive soak.

Each run uploads JSON reports, logs, source hashes and a build-only record, including failed assertions. Artifacts expire after 14 days; acceptance evidence is committed separately at [qa/issue53-evidence](https://github.com/jarvizu87/LetMeFly/tree/qa/issue53-evidence/qa-evidence/issue-53).

This service/database soak is not a full UI-click simulation. PR #66 adds the native public-UI load/group/metric audit; PR #63 independently verifies interrupted completion recovery on normal app startup. Combined acceptance uses `.github/workflows/parallel-43-53-integration.yml` on `qa/issue53-finish`.

All state is disposable. Real athlete data, cloud sync, and operating-system power loss are outside this test's certification.
