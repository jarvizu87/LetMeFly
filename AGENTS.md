# LetMeFly Automated Development Guardrails

These rules apply to AI agents, automation, CLI sessions, MCP/plugin tools, and human contributors working on LetMeFly.

## Deployment policy

LetMeFly production is intentionally release-gated because Netlify charges credits for every production deploy.

1. Work on a feature/fix branch. Do not develop directly on `main`.
2. Use GitHub CI and Netlify Deploy Previews/branch deploys for iteration and browser QA.
3. Do not invoke a Netlify production deploy through API, MCP/plugin, CLI, UI retry, build hook, or other manual mechanism during development.
4. Do not run `netlify deploy --prod` from development automation.
5. Merge only after the required app/program/browser audits are green.
6. A production publish is explicit. The production commit message must contain `[release netlify]`.
7. Never add `[release netlify]` to ordinary feature commits or intermediate PRs.
8. If production is unavailable because credits are exhausted, do not repeatedly retry production. Continue with CI and Deploy Previews until credits are restored.

The active production project is `let-me-fly`. Do not create or deploy a second production LetMeFly project without an intentional architecture decision.

## Required flow

Feature branch -> GitHub CI -> Netlify Deploy Preview -> browser/program audits -> fixes on the same branch -> final PR -> intentional release merge -> one production deploy.

When several PRs are being integrated concurrently, merge them without the release marker, validate the combined `main`, then use one dedicated release PR/commit carrying `[release netlify]` to publish the accumulated batch.

## Program and athlete-data boundaries

Deployment changes must not alter Crownforge, Crown Maintenance, Black Crown, workout persistence, private athlete data, training maxes, or progression rules unless the task explicitly requires such a governed change.
