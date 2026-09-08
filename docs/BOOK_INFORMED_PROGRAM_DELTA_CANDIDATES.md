# LetMeFly Book-Informed Program Delta Candidates

Status: **candidate audit only — no current production prescription is changed by this document or workflow.**

## Purpose

The private Training Intelligence book/manual library is allowed to validate existing LetMeFly rules or create intentional revision candidates. It is not allowed to silently rewrite Crownforge or Black Crown. The governing rule remains **REPLACE > ADD**, and explicit program-source decisions outrank generic outside-method recommendations unless a deliberate revision proves better.

## Crownforge v2.1 — candidate CPG-001

### Canonical source finding

Across Crownforge Weeks 1–12, Day 5 is the KB / sled / GPP control day. The v2.1 FLEX rule already protects Day 6: skipped GPP is never made up on Day 6, and Day-6 Bench/full-body quality has priority.

Day 6 then contains two separate KB Swing roles:

1. a **2 x 10 light KB Swing primer** in the warm-up/primer block; and
2. the actual Day-6 KB Swing dose in the main full-body circuit.

The main Day-6 swing dose is deliberately wave-loaded and is not being questioned. Weeks 6 and 12 also preserve their existing deload loading.

### Test-only delta

Change only the Day-6 light KB Swing primer from `mandatory` to `conditional`:

- keep the existing load;
- keep the existing maximum dose of 2 x 10;
- perform it only when hinge timing/stiffness needs a technical ramp;
- omit it when Day-5 GPP was fully completed and the Day-6 hinge pattern is already crisp;
- never use the primer as make-up GPP.

The main Day-6 KB Swing dose, Day-5 GPP, Bench work, sled work, Olympic work and all other prescriptions remain unchanged.

### Why it is only a candidate

The source explicitly calls this work a primer, but current v2.1 does not authorize omission. Book-derived overlap/fatigue principles are enough to justify a controlled test, not enough to declare the source wrong. Promotion therefore requires both clean regression and useful athlete/session evidence.

## Black Crown v2.0 — proposed B5 abduction delta rejected

### Canonical source finding

Black Crown Block 5 Weeks 25–29 Day 5 already contains:

- Front Squat support;
- Close-Grip Bench;
- primary Chest-Supported Row 4 x 8–10;
- Cable Press-Around;
- structural support: Lat Pulldown 2–3 x 8–10 + Chest-Supported Row 2 x 8–10;
- the programmed carry.

Most importantly, those exact sessions contain the explicit source-local rule:

> No additional loaded glute slot; weekly roles already supplied by D1 hip thrust/lunge + D3 deadlift.

The earlier book-informed idea was to replace the second 2-set row with a low-axial hip-abduction role. Jeff Nippard's glute-specialization material supports abduction as a distinct glute role, but that does **not** override Black Crown's explicit decision that the weekly glute roles are already filled.

### Current decision

**Reject the abduction replacement for current Black Crown v2.0.**

The Exercise Intelligence library may still keep Machine Hip Abduction / Seated Band Hip Abduction as future specialization-library candidates. They are not authorized Black Crown prescriptions.

Re-open this decision only if repeated private athlete data satisfies the existing DR-009 trigger: the glute target is genuinely flat while primary performance and recovery remain stable, and reallocation is demonstrated to be preferable to the current yoke/back support.

Week 30 is explicitly out of scope and remains unchanged.

## Other book-informed conclusions

- Black Crown B5 chest volume stays unchanged. Its Bench/incline/adduction architecture is already dense and role-complete.
- Full Triphasic eccentric/isometric/concentric blocks are not added by default. They remain future weakness-specific tools only.
- APRE remains advisory/research around authorized checks; it does not replace Black Crown percentage/TM authority.
- Velocity-based training evidence supports a future **crisp / slowing / grind** quality observation in private Coach Mode. That is a system/data enhancement, not a prescription rewrite.
- Crownforge and Black Crown should gain workload/overlap analytics before further book-driven volume changes are considered.

## Candidate CI boundaries

`ci/apply-book-informed-program-delta-candidate.sh` is intentionally isolated from the production build. The dedicated candidate workflow reconstructs the current governed app, applies only the Crownforge primer candidate, then proves:

- only three Crownforge source files changed;
- W1–12 consume the conditional Day-6 primer rule;
- Day-5 and main Day-6 KB Swing work remain intact;
- Weeks 6/12 deload logic remains intact;
- Black Crown is byte-tree unchanged;
- Crown Maintenance is byte-tree unchanged;
- Black Crown W25–29 retains its no-extra-glute rule and structural row;
- Week 30 remains unchanged;
- current source, Crownforge, exercise-library, UI, TypeScript, build and Black Crown runtime gates still pass.

A clean candidate CI run means the candidate is technically safe to evaluate. It does **not** make it the official program.
