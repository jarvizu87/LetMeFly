# LetMeFly Production Release Ledger

This file is the lightweight release checkpoint for batched production publishes.

Do not update it for ordinary feature/fix work. Update it only when accumulated, audited `main` changes are intentionally being released to Netlify production.

## Release entry format

- Date:
- Main SHA:
- Release scope:
- Required CI/audits:
- Netlify production deploy count expected: 1
- Notes:

## Release — approved primary-tab UI redesign

- Date: 2026-09-12
- Main SHA: `97bcdc1ce8af1dcde96db4ee8b39cd1e3b6eb374`
- Release scope: publish the approved locked-mockup UI redesign across Home, Train, Program, Progress, Exercises, Coach, Profile, and More, including final black/steel + red-primary / purple-secondary harmonization and the approved Raizen/Fenrir identity treatment.
- Required CI/audits: PR #90 full nine-workflow validation; integrated `main` Command V2 build/browser audit; Lifecycle Public UI; workout persistence; Home Option 1; cloud sync; Black Crown v2.1; Exercise Intelligence coverage/catalog; and Netlify release policy.
- Netlify production deploy count expected: 1
- Notes: release is visual/presentation-focused and preserves governed program prescriptions, workout persistence, private athlete data, Training Max ownership, Exercise Intelligence records, and Coach decision logic. Production publication must occur only through the Git-linked release gate with `[release netlify]` in the merge commit message.

## Current policy activation

- Date: 2026-09-10
- Main SHA: pending merge of the credit-safe workflow PR
- Release scope: install production-deploy credit guard and documented release discipline
- Required CI/audits: deployment-policy audit plus existing LetMeFly build/audit suite
- Netlify production deploy count expected: 0 for policy installation when merged with `[skip netlify]`; future intentional releases use `[release netlify]`
- Notes: 200 production deploys consumed 3,000 credits during the prior sprint; production is now explicit-only.
