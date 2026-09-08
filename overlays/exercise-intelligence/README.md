# LetMeFly Exercise Intelligence Overlay

This folder is an **inert data overlay** generated from
`LetMeFly_Exercise_Intelligence_Master_v7_QA_CLEAN_INTEGRATION_READY.xlsx`.

## Current coverage

- 92 canonical current-app exercises
- 92/92 movement-role coverage
- 92/92 coaching-detail coverage
- 25 governed substitution rules
- 23 substitution rules with alternatives already present in the current app
- 2 explicit `DO NOT DEFAULT` relationships
- 11 direct-demo candidates that still require URL validation

## Hard boundary

This overlay **does not own program prescriptions**. Crownforge, Crown Maintenance,
and Black Crown program packages remain authoritative for exercise selection,
sets, reps, percentages, loads, RPE/RIR, tempo, rest, phase logic, testing,
deloads, progression, and schedule structure.

A substitution may be surfaced only when its rule allows it. The application must
respect `promotionStatus`, `rolePreserved`, `useCondition`, and
`programOwnershipRule`.

`candidateDirectUrl` values are review candidates only and must not replace the
current demo URL until intentionally validated.

Private thumbnail Drive IDs/URLs are provenance, not public runtime assets.
