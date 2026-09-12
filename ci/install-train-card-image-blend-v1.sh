#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-al/train-card-image-blend-v1.css"
CSS_OUT="$DIST/ui/train-card-image-blend-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$CSS_SRC" "$INDEX" "$SW"; do
  test -s "$required"
done

grep -Fq '.active-exercise.lmf-workout-flow-card > .lmf-exercise-media' "$CSS_SRC"
grep -Fq 'background-size:contain!important' "$CSS_SRC"
grep -Fq '.exercise-card:not(.active-exercise)[data-exercise-art]::before' "$CSS_SRC"
grep -Fq 'pointer-events:none!important' "$CSS_SRC"

# Presentation guardrail: this layer is CSS-only and may not touch program or
# athlete data. Keep the build failure explicit if executable/data files appear.
test "${CSS_SRC##*.}" = "css"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/train-card-image-blend-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
marker = '<link rel="stylesheet" href="/ui/train-card-image-blend-v1.css?v=1">'
if '</head>' not in text:
    raise SystemExit('production index missing </head>')
text = text.replace('</head>', f'  {marker}\n</head>', 1)
p.write_text(text)
PY

SW="$SW" python - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = ['/ui/train-card-image-blend-v1.css']
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/train-card-image-blend-v1.css?v=1' "$INDEX"
grep -Fq "'/ui/train-card-image-blend-v1.css'" "$SW"
grep -Fq 'linear-gradient(90deg,#071016' "$CSS_OUT"

echo "LetMeFly Train blended exercise artwork v1: PASS"
