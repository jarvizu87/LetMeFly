# LetMeFly Exercise Demo Validation Ledger

Status date: 2026-09-07 (America/Los_Angeles)

This ledger governs the 11 legacy `candidateDirectUrl` values in the immutable
Exercise Intelligence v7 base payload. It does **not** modify that immutable base.

## Promotion rule

A candidate direct demo is not promoted merely because an old exercise-library map
associates the ID with a similar title. Promotion requires all of the following:

1. The media maps to the exact LetMeFly movement or an intentionally accepted alias.
2. The media is specific enough to teach the programmed movement, not only a broader
   movement family.
3. The direct media URL is currently playable/reachable.
4. The source is suitable as an instructional demonstration.
5. Promotion is intentional and audited; search fallbacks remain in place otherwise.

A title-map match without current playback verification remains **PENDING**, not
approved. A mismatch, overly generic demo, duplicate used for a more-specific
movement, or known stale/dead URL is **REJECTED**.

## Legacy v7 candidate audit

| Exercise | Candidate | Historical source mapping | Decision | Reason |
| --- | --- | --- | --- | --- |
| Back Squat | `https://vimeo.com/152122943` | Barbell Back Squat | `PENDING_PLAYBACK` | Exact movement mapping found; current direct Vimeo playback has not been independently verified. |
| Band Pull-Apart | `https://vimeo.com/151349655` | Band Pull Apart | `PENDING_PLAYBACK` | Exact movement mapping found; current direct playback remains unverified. |
| Bench Press | `https://vimeo.com/152122944` | Barbell Bench Press | `PENDING_PLAYBACK` | Exact movement mapping found; current direct playback remains unverified. |
| Clean-Grip RDL to Knee | `https://vimeo.com/151480359` | Barbell Romanian Deadlift | `REJECT_MISMATCH` | Generic RDL does not specifically demonstrate the governed clean-grip-to-knee variation. |
| Clean Pull | `https://vimeo.com/151365440` | Hang Pull | `REJECT_MISMATCH` | Historical ID maps to Hang Pull, not the canonical Clean Pull movement. |
| Face Pull | `https://vimeo.com/151365424` | Face Pull | `PENDING_PLAYBACK` | Exact movement mapping found; current direct playback remains unverified. |
| Farmer Carry | `https://vimeo.com/151365422` | Farmer's Walk | `PENDING_PLAYBACK` | Accepted title-equivalent movement mapping; current direct playback remains unverified. |
| Front Squat | `https://vimeo.com/152122947` | Barbell Front Squat | `REJECT_STALE` | Historical mapping is exact, but the candidate is stale/dead; the current verified YouTube demo stays authoritative. |
| Glute Bridge | `https://vimeo.com/151349622` | Glute Bridge | `PENDING_PLAYBACK` | Exact movement mapping found; current direct playback remains unverified. |
| Glute Bridge Isometric Hold | `https://vimeo.com/151349622` | Glute Bridge | `REJECT_MISMATCH` | Same generic Glute Bridge media is reused and does not specifically teach the isometric-hold variation. |
| Goblet Squat | `https://vimeo.com/152122978` | Kettlebell Goblet Box Squat | `REJECT_MISMATCH` | Candidate is the box-squat variation, not canonical Goblet Squat. The historical map lists `152122979` for Kettlebell Goblet Squat, but that ID is only a research lead until playback is independently verified. |

### Totals

- `PENDING_PLAYBACK`: 6
- `REJECT_MISMATCH`: 4
- `REJECT_STALE`: 1
- promoted from these legacy candidates: 0

## Black Crown v2.1 supplement demos

The Black Crown v2.1 supplement is separate from the immutable 11-candidate legacy
set. Its two new movements have direct-verified demos and do not use unresolved
candidate URLs:

| Exercise | Direct demo | Runtime status |
| --- | --- | --- |
| Machine Hip Abduction | `https://www.youtube.com/watch?v=tn-ABeb1QAM` | `direct-verified` |
| Seated Band Hip Abduction | `https://www.youtube.com/watch?v=BqZIR0PvxxU` | `direct-verified` |

`ci/install-exercise-intelligence-v2-supplement.sh` fails if either supplement demo
stops being represented as a direct verified watch URL in the governed source data.

## Source-map evidence

The historical Vimeo ID/title relationships were cross-checked against surviving
indexed copies of the old exercise-library hyperlink map. Relevant mappings include:

- `152122943` → Barbell Back Squat
- `151349655` → Band Pull Apart
- `152122944` → Barbell Bench Press
- `151480359` → Barbell Romanian Deadlift
- `151365440` → Hang Pull
- `151365424` → Face Pull
- `151365422` → Farmer's Walk
- `152122947` → Barbell Front Squat
- `151349622` → Glute Bridge
- `152122978` → Kettlebell Goblet Box Squat
- `152122979` → Kettlebell Goblet Squat (research lead only)

This mapping evidence confirms historical intent; it does **not** prove that a
Vimeo URL is currently playable. Playback verification remains a separate gate.
