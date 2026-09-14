#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-at/crownforge-circuit-train-v1.js"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-at/crownforge-circuit-train-v1.css"
JS_OUT="$DIST/ui/crownforge-circuit-train-v1.js"
CSS_OUT="$DIST/ui/crownforge-circuit-train-v1.css"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$JS_SRC" "$CSS_SRC" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing Crownforge circuit Train UX asset: $required" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq 'data.groupType' "$JS_SRC" || grep -Fq 'dataset.groupType' "$JS_SRC"
grep -Fq 'data-programmed-load-default' "$ROOT_DIR/ci/apply-workout-prescription-fidelity-v1.sh"
grep -Fq 'data-load-unit' "$ROOT_DIR/ci/apply-athlete-weight-unit-v1.sh"
grep -Fq 'AS PROGRAMMED' "$JS_SRC"
grep -Fq 'lmf-circuit-panel' "$CSS_SRC"
grep -Fq 'width:min(50%,250px)' "$CSS_SRC"
grep -Fq 'position:absolute!important' "$CSS_SRC"
grep -Fq '> :not(.lmf-exercise-media)' "$CSS_SRC"

# This layer may prefill blank native controls for confirmation, but it must not
# persist, complete, substitute, or rewrite program data itself.
! grep -Eq 'indexedDB|localStorage|sessionStorage|logSet\(|completeWorkout\(|put\(|delete\(|fetch\(' "$JS_SRC"

mkdir -p "$DIST/ui"
cp "$JS_SRC" "$JS_OUT"
cp "$CSS_SRC" "$CSS_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/crownforge-circuit-train-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/crownforge-circuit-train-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/crownforge-circuit-train-v1.css?v=2">'
js = '<script defer src="/ui/crownforge-circuit-train-v1.js?v=2"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index missing head/body boundary')
text = text.replace('</head>', f'  {css}\n</head>', 1)
text = text.replace('</body>', f'  {js}\n</body>', 1)
p.write_text(text)
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = ['/ui/crownforge-circuit-train-v1.css', '/ui/crownforge-circuit-train-v1.js']
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

node --check "$JS_OUT"
grep -Fq '/ui/crownforge-circuit-train-v1.css?v=2' "$INDEX"
grep -Fq '/ui/crownforge-circuit-train-v1.js?v=2' "$INDEX"
grep -Fq "'/ui/crownforge-circuit-train-v1.css'" "$SW"
grep -Fq "'/ui/crownforge-circuit-train-v1.js'" "$SW"

# This installer is the shared last-stage Train hook used by Command V2 and the
# Netlify build. Apply the final preview parity and Coach intent guards here so
# every build path audits the same final artifact.
bash "$ROOT_DIR/ci/install-train-preview-parity-final-v1.sh" "$DIST"
bash "$ROOT_DIR/ci/install-coach-core-intents-v2.sh" "$DIST"

echo "LetMeFly circuit-first Train confirm-or-adjust UX + larger blended art + final parity/Coach guards: PASS"