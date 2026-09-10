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

## Current policy activation

- Date: 2026-09-10
- Main SHA: pending merge of the credit-safe workflow PR
- Release scope: install production-deploy credit guard and documented release discipline
- Required CI/audits: deployment-policy audit plus existing LetMeFly build/audit suite
- Netlify production deploy count expected: 0 for policy installation when merged with `[skip netlify]`; future intentional releases use `[release netlify]`
- Notes: 200 production deploys consumed 3,000 credits during the prior sprint; production is now explicit-only.
