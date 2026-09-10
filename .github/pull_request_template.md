## Scope

Describe the feature/fix and the files or subsystem it changes.

## Validation

- [ ] Required GitHub CI/audits pass
- [ ] Netlify Deploy Preview or branch deploy used for rendered QA when applicable
- [ ] No manual/API/MCP/CLI Netlify production deploy was used during development
- [ ] Crownforge / Crown Maintenance / Black Crown prescriptions are unchanged unless this PR intentionally governs a program revision
- [ ] Private athlete-data boundaries are preserved

## Production release

Default: **do not publish production from an intermediate PR.**

- [ ] This PR is only an integration/development PR; merge without `[release netlify]`
- [ ] OR this is the intentionally approved final release; merge commit contains `[release netlify]` and should create exactly one Netlify production deploy

See `docs/DEPLOYMENT_WORKFLOW.md`.
