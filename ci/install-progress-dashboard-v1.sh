#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v1.js"
JS_V3_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v3-polish.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v1.css"
CSS_V2_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v2.css"
CSS_V3_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-z/progress-dashboard-v3.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$JS_V3_SOURCE"
test -s "$CSS_SOURCE"
test -s "$CSS_V2_SOURCE"
test -s "$CSS_V3_SOURCE"
node --check "$JS_SOURCE"
node --check "$JS_V3_SOURCE"

grep -Fq 'PROGRESS DASHBOARD' "$JS_SOURCE"
grep -Fq "['overview', 'strength', 'body', 'conditioning', 'prs']" "$JS_SOURCE"
grep -Fq 'COACH INSIGHT' "$JS_SOURCE"
grep -Fq 'NEXT MILESTONE' "$JS_SOURCE"
grep -Fq 'letmefly_private_strength_maxes_v1' "$JS_SOURCE"
grep -Fq "const DB_NAME = 'letmefly-private'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'trainingMaxHistory'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'workoutSessions'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'bodyweightEntries'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'readinessEntries'" "$JS_SOURCE"
grep -Fq "readStoreForAthlete(db,'personalRecords'" "$JS_SOURCE"
grep -Fq 'MANAGE TRAINING MAXES' "$JS_SOURCE"
grep -Fq '__LMF_PROGRESS_DASHBOARD__' "$JS_SOURCE"
grep -Fq '__LMF_PROGRESS_POLISH__' "$JS_V3_SOURCE"
grep -Fq 'strengthPoints(data)' "$JS_V3_SOURCE"
grep -Fq 'conditioningData(data)' "$JS_V3_SOURCE"
grep -Fq 'Keep programming unchanged' "$JS_V3_SOURCE"
grep -Fq '.lmf-progress-dashboard' "$CSS_SOURCE"
grep -Fq '.lmf-pg-lift-card' "$CSS_SOURCE"
grep -Fq '.lmf-pg-native-tools' "$CSS_V2_SOURCE"
grep -Fq '.lmf-pg-readiness-grid' "$CSS_V2_SOURCE"
grep -Fq '.lmf-pg-conditioning-metrics' "$CSS_V3_SOURCE"
grep -Fq '@media(max-width:390px)' "$CSS_V3_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/progress-dashboard-v1.js"
cp "$JS_V3_SOURCE" "$DIST_DIR/ui/progress-dashboard-v3-polish.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/progress-dashboard-v1.css"
cp "$CSS_V2_SOURCE" "$DIST_DIR/ui/progress-dashboard-v2.css"
cp "$CSS_V3_SOURCE" "$DIST_DIR/ui/progress-dashboard-v3.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css1 = '<link rel="stylesheet" href="/ui/progress-dashboard-v1.css">'
css2 = '<link rel="stylesheet" href="/ui/progress-dashboard-v2.css">'
css3 = '<link rel="stylesheet" href="/ui/progress-dashboard-v3.css">'
js1 = '<script defer src="/ui/progress-dashboard-v1.js"></script>'
js3 = '<script defer src="/ui/progress-dashboard-v3-polish.js"></script>'
for css in (css1, css2, css3):
    if css not in text:
        if '</head>' not in text:
            raise SystemExit('index.html is missing </head>')
        text = text.replace('</head>', f'  {css}\n</head>', 1)
for js in (js1, js3):
    if js not in text:
        if '</body>' not in text:
            raise SystemExit('index.html is missing </body>')
        text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

node --check "$DIST_DIR/ui/progress-dashboard-v1.js"
node --check "$DIST_DIR/ui/progress-dashboard-v3-polish.js"
test -s "$DIST_DIR/ui/progress-dashboard-v1.css"
test -s "$DIST_DIR/ui/progress-dashboard-v2.css"
test -s "$DIST_DIR/ui/progress-dashboard-v3.css"
grep -Fq '/ui/progress-dashboard-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v2.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v3.css' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/progress-dashboard-v3-polish.js' "$DIST_DIR/index.html"
grep -Fq 'PROGRESS DASHBOARD' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'Private vault data' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq 'never rewrite programming' "$DIST_DIR/ui/progress-dashboard-v1.js"
grep -Fq '__LMF_PROGRESS_POLISH__' "$DIST_DIR/ui/progress-dashboard-v3-polish.js"

echo "LetMeFly Progress dashboard v3 polish + authoritative private-vault performance UI: PASS"
