#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ai/workout-load-display-sync-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-ai/workout-load-display-sync-v1.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
node --check "$JS_SOURCE"

grep -Fq "Never writes workout/program prescription data" "$JS_SOURCE"
grep -Fq "data-lmf-live-load" "$CSS_SOURCE"
grep -Fq "closest" "$JS_SOURCE"
grep -Fq "per side:" "$JS_SOURCE"
grep -Fq "min-width: 0 !important" "$CSS_SOURCE"
grep -Fq "font-size: clamp(19px, 5.2vw, 22px)" "$CSS_SOURCE"
grep -Fq "grid-template-columns: 30px minmax(0, 1fr) 30px" "$CSS_SOURCE"
grep -Fq "font-size: 14px" "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/workout-load-display-sync-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/workout-load-display-sync-v1.css"

# The smart Bar Loader is installed immediately before this companion layer.
# Expand only its inventory quantity ceiling from a rack-sized 12 pairs to a
# whole-gym 24 pairs. Keep the visual plate stack clipped at 12 chips so very
# heavy loads remain readable; the +N indicator continues to represent extras.
BAR_LOADER="$DIST_DIR/ui/smart-names-bar-loader-v1.js"
test -s "$BAR_LOADER" || { echo "Installed Bar Loader runtime is missing: $BAR_LOADER" >&2; exit 1; }
BAR_LOADER="$BAR_LOADER" python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ['BAR_LOADER'])
s = p.read_text()
solver = "Math.min(12, Number.parseInt(pairs[String(denom)] ?? 0, 10) || 0)"
entry = "Math.min(12, Number.parseInt(input.value || '0', 10) || 0)"
if s.count(solver) != 1:
    raise SystemExit(f'Expected one Bar Loader solver pair ceiling, found {s.count(solver)}')
if s.count(entry) != 2:
    raise SystemExit(f'Expected two Bar Loader inventory entry ceilings, found {s.count(entry)}')
if s.count('max="12"') != 1:
    raise SystemExit(f'Expected one Bar Loader inventory input max, found {s.count("max=\"12\"")}')
s = s.replace(solver, "Math.min(24, Number.parseInt(pairs[String(denom)] ?? 0, 10) || 0)", 1)
s = s.replace(entry, "Math.min(24, Number.parseInt(input.value || '0', 10) || 0)")
s = s.replace('max="12"', 'max="24"', 1)
p.write_text(s)
PY
node --check "$BAR_LOADER"
grep -Fq 'max="24"' "$BAR_LOADER"
grep -Fq "Math.min(24, Number.parseInt(pairs[String(denom)]" "$BAR_LOADER"
grep -Fq "Math.min(24, Number.parseInt(input.value" "$BAR_LOADER"
# Visual clipping is intentionally still 12 plates per side.
grep -Fq 'const clipped = all.slice(0, 12)' "$BAR_LOADER"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/workout-load-display-sync-v1.css">'
js = '<script defer src="/ui/workout-load-display-sync-v1.js"></script>'

if css not in text:
    if '</head>' not in text.lower():
        raise SystemExit('index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)

if js not in text:
    if '</body>' not in text.lower():
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

checks = {
    'single sync stylesheet': text.count('/ui/workout-load-display-sync-v1.css') == 1,
    'single sync runtime': text.count('/ui/workout-load-display-sync-v1.js') == 1,
    'single doctype': len(re.findall(r'<!doctype\s+html[^>]*>', text, re.I)) == 1,
    'single body close': len(re.findall(r'</body>', text, re.I)) == 1,
    'single html close': len(re.findall(r'</html>', text, re.I)) == 1,
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit('workout load display install validation failed: ' + ', '.join(failed))

p.write_text(text.rstrip() + '\n')
PY

node --check "$DIST_DIR/ui/workout-load-display-sync-v1.js"
test -s "$DIST_DIR/ui/workout-load-display-sync-v1.css"
grep -Fq '/ui/workout-load-display-sync-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/workout-load-display-sync-v1.js' "$DIST_DIR/index.html"
grep -Fq 'data-lmf-live-load' "$DIST_DIR/ui/workout-load-display-sync-v1.css"
grep -Fq 'per side:' "$DIST_DIR/ui/workout-load-display-sync-v1.js"

echo "LetMeFly mobile load legibility + live inline bar-load sync + 24-pair whole-gym inventory capacity: PASS"
