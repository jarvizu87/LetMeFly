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

## Release — Crownforge Train + Crown Maintenance / Black Crown card fidelity

- Date: 2026-09-13
- Main SHA: `f37bf2c720b47f01a37e09f9ba640fdf87b34529`
- Release scope: publish the audited Crownforge circuit-first Train UX from PR #93, Crown Maintenance percentage-load/card fixes and Black Crown prescription-fidelity fixes from PR #94, and the standard Seven-Athlete + Chaos/Resilience release gate from PR #95.
- Required CI/audits: complete 10-step program/card audit; Seven-Athlete + Chaos/Resilience gate; Command V2 full build plus real mobile/desktop browser audit; Crownforge v2.2; Black Crown v2.1; Maintenance runtime load + Bar Loader; workout persistence/recovery; Workout Substitute Today; athlete progression/program boundaries; Lifecycle Public UI; Home Option 1; cloud bootstrap regression; and Netlify release policy.
- Netlify production deploy count expected: 1
- Notes: governed Crownforge, Crown Maintenance, and Black Crown prescriptions remain unchanged. This release improves workout-card translation, percentage/reference load resolution, circuit grouping, prescription detail fidelity, programmed-load confirmation, exercise-art blending, and QA/release coverage. Production publication is authorized only by `[release netlify]` on the final merge commit.

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
