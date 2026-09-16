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

## Release — Workout Mode hydration + desktop shell + whole-gym Bar Loader

- Date: 2026-09-15
- Main SHA: `46150b7975c4b1bed17e344456851ac78bf64726`
- Release scope: publish PR #113 so governed Crownforge, Crown Maintenance, and Black Crown prescriptions hydrate blank Workout Mode logging controls without rewriting program definitions; preserve saved/completed athlete actuals and same-prescription carry-forward precedence; ship the corrected compact desktop shell/navigation; and support confirmed whole-gym Bar Loader inventories up to 24 pairs per denomination instead of the former 12-pair ceiling.
- Required CI/audits: PR #113 exact-head 10/10 workflow pass at `cdb5bfcaff530d9b07cb71ccd9c8223b6193c32c`, including Command V2 production-style browser audit, Seven-Athlete exhaustive program/week/day/card + Coach + substitution/safety + chaos/lifecycle + synthetic-identity isolation, Cloud Sync Bootstrap Regression, Desktop Shell Navigation, Exercise Intelligence Completion, Lifecycle Public UI, workout persistence, Home Option 1, Maintenance Runtime Load + Bar Loader, Netlify Release Policy, and explicit 24-pair whole-gym Bar Loader contract proof; plus integrated `main` 6/6 workflow pass at `46150b7975c4b1bed17e344456851ac78bf64726`, covering Cloud Sync Bootstrap Regression, Desktop Shell Navigation, Exercise Intelligence Completion, Netlify Release Policy, Command V2 full production/browser audit, and the complete Seven-Athlete release audit.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes and no workout-history, profile, Training Max, readiness, progression, or private-athlete data writes are introduced by this release. Production publication is authorized only by `[release netlify]` on this ledger-only release merge.

## Corrective Release — Exercise Library private-art keys

- Date: 2026-09-14
- Main SHA: `d285905245b09558c88d39efbde6f477dedabff5`
- Release scope: publish PR #107 so every resolved Exercise Library card is normalized to its governed Exercise Intelligence thumbnail canonical key, allowing the existing private-art loader to resolve the athlete's approved private exercise image instead of leaving older/program-driven cards on legacy art slugs.
- Required CI/audits: PR #107 exact-head 10/10 workflow pass at `7f51c715fcdfd6b7e74def277eaea56296a1b9b4`, including Command V2 real mobile/desktop browser coverage, Seven-Athlete + Chaos/Resilience, Exercise Intelligence Audit + Completion, Cloud Sync Bootstrap Regression, Maintenance Runtime Load + Bar Loader, workout persistence, Lifecycle Public UI, Home Option 1, and Netlify Release Policy; live deploy-preview acceptance across all primary tabs and opening Sign In / Register / Forgot Password / local-athlete surfaces; plus integrated `main` 6/6 workflow pass at `d285905245b09558c88d39efbde6f477dedabff5`, including the 112-exercise canonical private-art browser proof inside both Exercise Intelligence Completion and the exhaustive Seven-Athlete release gate.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes and no athlete-private data changes. The fix is presentation-only, does not rewrite image bytes or Supabase records, and keeps production publication gated to one explicit `[release netlify]` merge.

## Corrective Release — Train card parity + exhaustive Coach/release gate

- Date: 2026-09-14
- Main SHA: `89016d37ae7bff50a187d24b9676a7889804e79d`
- Release scope: publish PR #105 so future/non-current Train days retain the approved full-card exercise presentation after all late UI layers; add athlete-aware Coach freeform handling for progress, Training Max, readiness, short-time, equipment, poor-session, and specialization questions; and make the Seven-Athlete release gate exhaustive across every major route, every governed program/week/day/card, both Coach scenario layers, substitution/safety, chaos/lifecycle boundaries, and synthetic-identity isolation.
- Required CI/audits: PR #105 exact-head 10/10 workflow pass at `db62517985644556fde3fc8d64fcfd9fec0fdecd`, including the strengthened Seven-Athlete audit with 70/70 route mounts, 383 governed days, 4,682 rendered exercise cards, both Coach suites, substitution/safety, chaos/lifecycle, Command V2 real mobile/desktop browser audit, Black Crown v2.1, Maintenance Runtime Load + Bar Loader, Cloud Sync Bootstrap Regression, workout persistence, Lifecycle Public UI, Home Option 1, Exercise Intelligence Completion, and Netlify Release Policy; plus merged `main` 6/6 acceptance pass at `89016d37ae7bff50a187d24b9676a7889804e79d` covering Exercise Intelligence Completion, Command V2, Seven-Athlete, Black Crown v2.1, Cloud Sync Bootstrap Regression, and Netlify Release Policy.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes and no athlete-private data changes. This release corrects final rendered Train preview parity, expands Coach intent coverage, and permanently strengthens the release gate so future green results require full-app and full-program rendered verification. Production publication is authorized only by `[release netlify]` on the final merge commit.

## Corrective Release — In-app PWA update control

- Date: 2026-09-13
- Main SHA: `5d9b0197dbd7a33f789796e9d5c52f31043f8f91`
- Release scope: publish PR #103 so installed LetMeFly PWAs gain an athlete-safe in-app update path: Settings → App updates with manual CHECK NOW plus UPDATE NOW / RELOAD NOW states when appropriate; automatic checks on startup, foreground, reconnect, and interval; an update-ready banner; a release-distinct service-worker token; exact updater-script precaching; and safe service-worker activation/client claiming without uninstalling the app.
- Required CI/audits: PR #103 exact-head 9/9 workflow pass, including Command V2 full build + real mobile/desktop browser audit, Seven-Athlete + Chaos/Resilience, workout persistence, Lifecycle Public UI, Maintenance Runtime Load + Bar Loader, Home Option 1, Cloud Sync Bootstrap Regression, Exercise Intelligence Completion, and Netlify Release Policy; plus integrated `main` 5/5 workflow pass at `5d9b0197dbd7a33f789796e9d5c52f31043f8f91`, including Command V2, Seven-Athlete, Cloud Sync, Exercise Intelligence Completion, and Netlify Release Policy.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes and no athlete-private data changes. The updater does not clear localStorage, IndexedDB, workout history, profile state, TMs, readiness, PRs, or the private athlete vault. Existing pre-v1 installed PWAs may need one close/reopen or normal reload after this corrective release to render the new update controls; uninstall/reinstall is not required. Production remains held until this ledger-only release PR is intentionally merged through the explicit Git-linked production release gate.

## Release — Account/device sync + Exercise Intelligence completion

- Date: 2026-09-13
- Main SHA: `57747228ee51361b88d0ae6a83d1f6dbc8e4325d`
- Release scope: publish the audited post-production batch from PR #99, PR #100, and PR #101: deterministic governed Crownforge Day 3 circuit acceptance coverage; Account + Device Sync hardening for Sign In / Register / Forgot Password, phone-to-desktop-to-phone propagation, simultaneous-edit preservation, local-first/offline recovery, fresh-device profile pull, vault-mismatch protection, and installed-PWA banner suppression; plus completion of the 112-exercise governed Exercise Intelligence catalog, Watch Exercise behavior, reviewed substitution coverage, safe video fallbacks, and neutral instructional fallback art for Machine Hip Abduction and Seated Band Hip Abduction.
- Required CI/audits: integrated `main` 8/8 workflow pass at `57747228ee51361b88d0ae6a83d1f6dbc8e4325d`, including Command V2 full build + real mobile/desktop browser audit; Seven-Athlete + Chaos/Resilience; Crownforge v2.2; Black Crown v2.1; Cloud Sync Bootstrap Regression; Exercise Intelligence Audit; Exercise Intelligence Completion; and Netlify Release Policy.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes. No athlete-private data is added to the public shell. Production remains held until this ledger-only release PR is intentionally merged with the explicit production release marker required by the Git-linked Netlify gate.

## Corrective Release — Crownforge circuit production integration

- Date: 2026-09-13
- Main SHA: `1721a81b2a2de0b616159660c6047cb0106aad5a`
- Release scope: publish PR #97 so the Crownforge circuit-first Train JS/CSS is installed inside the authoritative shared Command V2 production artifact instead of relying on a trailing deployment-only step.
- Required CI/audits: PR #97 exact-head suite; Command V2 full build and real browser audit; Crownforge v2.2; Black Crown v2.1; Crown Maintenance runtime load + Bar Loader; workout persistence; Workout Substitute Today; Seven-Athlete + Chaos/Resilience; Lifecycle Public UI; Home Option 1; cloud bootstrap regression; Netlify release policy; static circuit artifact assertions; and governed Crownforge Day 3 structured-round browser regression.
- Netlify production deploy count expected: 1
- Notes: no Crownforge, Crown Maintenance, or Black Crown prescription changes. The earlier live smoke test incorrectly expected A1/A2/A3 badges on Week 1 Day 1 even though that section is not governed as `group_type=round`. The corrective release ensures the circuit presentation layer ships consistently so true governed round sections can render their CIRCUIT strip and movement codes.

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