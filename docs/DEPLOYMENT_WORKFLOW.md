# LetMeFly Credit-Safe Deployment Workflow

## Why this exists

Netlify charges LetMeFly for production deploys. During the September 2026 development sprint, 200 production deploys consumed 3,000 credits. The app itself used very little credit outside deployment activity.

Production therefore must be treated as a release event, not a development/test environment.

## Standard development flow

1. Create or continue a feature/fix branch from current `main`.
2. Commit all iteration to that branch.
3. Let GitHub CI run the governed LetMeFly audits.
4. Use the Netlify Deploy Preview or branch deployment for rendered/browser QA.
5. Fix failures on the same branch and rerun CI/preview checks.
6. Open or update the final pull request.
7. Confirm required program, persistence, browser, branding, and feature-specific gates are green.
8. Merge without production if more work is still being accumulated.
9. When the batch is intentionally ready to go live, publish exactly once using a release commit whose message contains `[release netlify]`.

## Netlify production gate

`netlify.toml` calls `ci/netlify-deploy-gate.sh` through Netlify's ignore-build mechanism.

- Deploy Preview: allowed.
- Branch deploy: allowed.
- Other non-production contexts: allowed.
- Production without `[release netlify]`: skipped.
- Production with `[release netlify]`: allowed.

The marker is deliberately explicit so an ordinary push or merge cannot silently spend production-deploy credits.

## Single-PR release

If one PR is the complete, audited batch and should go live immediately, merge it with a merge commit title/message containing:

`[release netlify]`

That merge should result in one production deployment.

## Multi-PR / concurrent release

If several lanes need to land first:

1. Merge the individual PRs without `[release netlify]`.
2. Revalidate the integrated `main` state with GitHub CI.
3. Create one small release PR that updates `docs/PRODUCTION_RELEASE_LEDGER.md` with the release checkpoint.
4. Merge that release PR with `[release netlify]` in the merge commit message.
5. Verify one production deployment and stop. Do not retry deployment unless there is a confirmed deployment failure that actually requires a retry.

## Manual/API deployment prohibition

During development, do not publish production through Netlify API, MCP/plugin tools, CLI `--prod`, build hooks, UI retries, or manual deploy actions. Those paths bypass the intended Git-reviewed release boundary and were a major source of unnecessary production deployment activity.

Netlify's project-level **Enforce deployment methods** setting should also be enabled so production can only be published through the Git workflow. This setting is configured in the Netlify UI and complements the repository gate.

## Credit target

Normal development should consume zero production-deploy credits until an intentional release. A completed release batch should normally consume 15 production-deploy credits: one deployment.
