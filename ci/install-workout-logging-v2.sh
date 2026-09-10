#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ae/workout-logging-v2.js"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ae/workout-logging-v2.css"

if [[ ! -d "$DIST" || ! -s "$INDEX" ]]; then
  echo "LetMeFly production dist is missing: $DIST" >&2
  exit 1
fi

test -s "$JS_SRC"
test -s "$CSS_SRC"
node --check "$JS_SRC"

# Guardrails: this layer may prefill editable logging inputs, but the native
# LetMeFly set button remains the only persistence boundary. No program/private
# database writes are allowed here.
! grep -Eq 'indexedDB\.|localStorage\.setItem|supabase|programInstances|trainingMaxHistory|workoutSets\.(put|add)|\.put\(|\.add\(' "$JS_SRC"
grep -Fq 'Existing LetMeFly set buttons remain the authoritative' "$JS_SRC"
grep -Fq 'Program-prescribed percentage/fixed loads always win' "$JS_SRC"
grep -Fq 'protectedProgramLoad' "$JS_SRC"
grep -Fq 'previousActualLoad' "$JS_SRC"
grep -Fq 'autoAdvance' "$JS_SRC"
grep -Fq 'data-lmf-rest-continue' "$JS_SRC"
grep -Fq 'lmf-logging-compact' "$CSS_SRC"
grep -Fq '.set-check.done' "$CSS_SRC"

mkdir -p "$DIST/ui"
cp "$JS_SRC" "$DIST/ui/workout-logging-v2.js"
cp "$CSS_SRC" "$DIST/ui/workout-logging-v2.css"

# Issue #50: once the standard logging overlay is copied into the exact production
# dist, narrow load carry-forward to same-prescription sets and preserve intentional
# load changes. The runtime patch remains presentation-only and uses native set save.
bash "$ROOT_DIR/ci/apply-workout-logging-fidelity-v1.sh" "$DIST"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/workout-logging-v2\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/workout-logging-v2\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/workout-logging-v2.css?v=2">'
js = '<script defer src="/ui/workout-logging-v2.js?v=2"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index is missing document boundaries')
text = text.replace('</head>', f'  {css}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
p.write_text(text)
PY

grep -Fq '/ui/workout-logging-v2.css?v=2' "$INDEX"
grep -Fq '/ui/workout-logging-v2.js?v=2' "$INDEX"
node --check "$DIST/ui/workout-logging-v2.js"
grep -Fq 'programmedLoadSignature' "$DIST/ui/workout-logging-v2.js"
grep -Fq 'targetStillAtProgramDefault' "$DIST/ui/workout-logging-v2.js"

echo "LetMeFly Workout Logging v2 auto-advance + Issue #50 governed load carry + compact mobile logging: PASS"

# Saved-set recovery is an additive ergonomics layer. It never bypasses the
# native set toggle or changes program prescriptions.
bash "$ROOT_DIR/ci/install-saved-set-recovery-v1.sh" "$DIST"

# Recording-driven mobile guard: vertical day scrolling takes priority over
# direct horizontal section swipes; section tabs/arrows remain authoritative.
bash "$ROOT_DIR/ci/install-workout-mobile-scroll-v1.sh" "$DIST"
