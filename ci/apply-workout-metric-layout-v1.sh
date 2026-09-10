#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
CSS="$TARGET/src/command-v2.css"
test -s "$CSS" || { echo "Missing command CSS: $CSS" >&2; exit 1; }

cat >> "$CSS" <<'CSS'

/* Issue #50 — hide meaningless load controls for genuinely non-loaded work.
   Loaded sleds/carries keep Load because data-has-load remains true. */
.lmf-workout-flow-card .set-row[data-has-load="false"] .load-field,
.lmf-workout-flow-card .set-row[data-has-load="false"] .lmf-plates-line{
  display:none!important;
}
@media(max-width:680px){
  .lmf-workout-flow-card .set-row[data-has-load="false"]{
    grid-template-areas:
      "set target target target target target target check"
      ". reps reps reps reps rpe rpe ."!important;
  }
}
CSS

grep -Fq 'data-has-load="false"' "$CSS"
grep -Fq 'reps reps reps reps rpe rpe' "$CSS"
echo "Issue #50 metric-aware workout layout: PASS"
