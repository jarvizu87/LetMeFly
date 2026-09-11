# Priority B preparation — work in progress

Tracking: #73, with thumbnails #69, Progress #70, athlete-aware Coach #71, and Training Intelligence integration #72.

This directory is an isolated preparation checkpoint. Nothing here is installed into the app, and no runtime, workout, program, or athlete-data behavior changes. Core PRs #43, #63, #66, and #68 were merged first. Integration remains subject to the stable-core release gate.

`athlete-insights.mjs` sketches actual-history summaries, comparable volume windows, and a review-only Coach brief. Only JavaScript syntax has been checked. Semantic tests, data-model integration, source validation, and UI review are still required; this is not production-ready code.

`coach-rule-manifest.json` transcribes the recovered v1.9R5 Coach decision-order section, including its source hash and STANDBY state. These are candidate review rules, not permission to change programming. Current governed app programs remain authoritative; source conflicts require review. A recorded hash describes the source section and does not independently authenticate it.

Next verification must cover athlete isolation, incomplete/deleted/orphaned records, load units, metric exercises, date boundaries, substitutions, zero baselines, and unsupported Coach triggers. No automatic prescriptions or program mutations are authorized by this checkpoint.

Thumbnail reconciliation found 202 active rows, 182 canonical keys, and 168 files in the locked-style folder. Twenty-four active keys lack an exact filename match; aliases and visual review must resolve whether artwork is actually missing. Eight registry array formulas are blocked by manual entries. Preserve approved manual overrides when repairing the registry. Private asset IDs, mappings, and raw registry exports are intentionally not included here.
