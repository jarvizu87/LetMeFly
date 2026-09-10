#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ak/progress-conditioning-v4.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ak/progress-conditioning-v4.css"
FINAL_JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ak/progress-finalize-v4.js"
FINAL_CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ak/progress-finalize-v4.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

for f in "$JS_SOURCE" "$CSS_SOURCE" "$FINAL_JS_SOURCE" "$FINAL_CSS_SOURCE"; do
  test -s "$f"
done
node --check "$JS_SOURCE"
node --check "$FINAL_JS_SOURCE"
grep -Fq "const VERSION = 4" "$JS_SOURCE"
grep -Fq "workoutSessions" "$JS_SOURCE"
grep -Fq "workoutExercises" "$JS_SOURCE"
grep -Fq "workoutSets" "$JS_SOURCE"
grep -Fq "personalRecords" "$JS_SOURCE"
grep -Fq "COMPLETED SETS" "$JS_SOURCE"
grep -Fq "MEASURED WORK" "$JS_SOURCE"
grep -Fq "NEXT MEASURABLE MILESTONE" "$JS_SOURCE"
grep -Fq "Program target:" "$JS_SOURCE"
grep -Fq "workload" "$JS_SOURCE"
grep -Fq "never counted as completed performance" "$JS_SOURCE"
grep -Fq "__LMF_PROGRESS_CONDITIONING__" "$JS_SOURCE"
grep -Fq ".lmf-pg-conditioning-v4" "$CSS_SOURCE"
grep -Fq "PROGRESS SIGNALS" "$FINAL_JS_SOURCE"
grep -Fq "TREND-READY LIFTS" "$FINAL_JS_SOURCE"
grep -Fq "PRIVATE BODYWEIGHT GOAL" "$FINAL_JS_SOURCE"
grep -Fq "AUTO-DETECTED PRs" "$FINAL_JS_SOURCE"
grep -Fq "First records establish baselines rather than creating fake PRs" "$FINAL_JS_SOURCE"
grep -Fq "not written back as official PR records" "$FINAL_JS_SOURCE"
grep -Fq "__LMF_PROGRESS_FINALIZE__" "$FINAL_JS_SOURCE"
grep -Fq ".lmf-pg-overview-v4" "$FINAL_CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/progress-conditioning-v4.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/progress-conditioning-v4.css"
cp "$FINAL_JS_SOURCE" "$DIST_DIR/ui/progress-finalize-v4.js"
cp "$FINAL_CSS_SOURCE" "$DIST_DIR/ui/progress-finalize-v4.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os, re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
for asset in ('progress-conditioning-v4','progress-finalize-v4'):
    text = re.sub(rf'\s*<script defer src="/ui/{asset}\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
    text = re.sub(rf'\s*<link rel="stylesheet" href="/ui/{asset}\.css(?:\?v=\d+)?">\s*', '\n', text)
for css in ('<link rel="stylesheet" href="/ui/progress-conditioning-v4.css?v=1">','<link rel="stylesheet" href="/ui/progress-finalize-v4.css?v=1">'):
    if css not in text:
        if '</head>' not in text:
            raise SystemExit('index.html is missing </head>')
        text = text.replace('</head>', f'  {css}\n</head>', 1)
for js in ('<script defer src="/ui/progress-conditioning-v4.js?v=1"></script>','<script defer src="/ui/progress-finalize-v4.js?v=1"></script>'):
    if js not in text:
        if '</body>' not in text:
            raise SystemExit('index.html is missing </body>')
        text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

node --check "$DIST_DIR/ui/progress-conditioning-v4.js"
node --check "$DIST_DIR/ui/progress-finalize-v4.js"
test -s "$DIST_DIR/ui/progress-conditioning-v4.css"
test -s "$DIST_DIR/ui/progress-finalize-v4.css"
grep -Fq '/ui/progress-conditioning-v4.css?v=1' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-conditioning-v4.js?v=1' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-finalize-v4.css?v=1' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-finalize-v4.js?v=1' "$DIST_DIR/index.html"
grep -Fq 'NEXT MEASURABLE MILESTONE' "$DIST_DIR/ui/progress-conditioning-v4.js"
grep -Fq '__LMF_PROGRESS_CONDITIONING__' "$DIST_DIR/ui/progress-conditioning-v4.js"
grep -Fq 'PROGRESS SIGNALS' "$DIST_DIR/ui/progress-finalize-v4.js"
grep -Fq '__LMF_PROGRESS_FINALIZE__' "$DIST_DIR/ui/progress-finalize-v4.js"

echo "LetMeFly Progress v4 Conditioning + final analytics: PASS"
