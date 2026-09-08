#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-v/smart-names-bar-loader-v1.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-v/smart-names-bar-loader-v1.css"
SPEC_SOURCE="$ROOT_DIR/docs/BAR_LOADER_UI_STANDARD_LOCKED_V1.md"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
test -s "$SPEC_SOURCE"
node --check "$JS_SOURCE"

grep -Fq "Inc DB Press" "$JS_SOURCE"
grep -Fq "Half-Kneeling Chop" "$JS_SOURCE"
grep -Fq "BAR LOADER" "$JS_SOURCE"
grep -Fq "AVAILABLE PLATES" "$JS_SOURCE"
grep -Fq "Iron Plates" "$JS_SOURCE"
grep -Fq "Bumper Plates" "$JS_SOURCE"
grep -Fq "45 lb Power Bar" "$JS_SOURCE"
grep -Fq "35 lb Technique Bar" "$JS_SOURCE"
grep -Fq "20 kg Men’s Bar" "$JS_SOURCE"
grep -Fq "15 kg Women’s Bar" "$JS_SOURCE"
grep -Fq "CLOSEST POSSIBLE" "$JS_SOURCE"
grep -Fq "data-lmf-copy-load" "$JS_SOURCE"
grep -Fq "lmf-bar-sleeve" "$JS_SOURCE"
grep -Fq "lmf-outer-collar" "$JS_SOURCE"
grep -Fq "visualPlateChips(solution.combo, unit, 'left')" "$JS_SOURCE"
grep -Fq "visualPlateChips(solution.combo, unit, 'right')" "$JS_SOURCE"
grep -Fq "data-lmf-bar-loader-open" "$JS_SOURCE"
grep -Fq "programmed workout loads are never changed" <(tr '[:upper:]' '[:lower:]' < "$JS_SOURCE")
grep -Fq "left and right plates must visibly sit on the sleeves" <(tr '[:upper:]' '[:lower:]' < "$SPEC_SOURCE")
grep -Fq "Iron Plates" "$SPEC_SOURCE"
grep -Fq "Bumper Plates" "$SPEC_SOURCE"

grep -Fq ".lmf-bar-sleeve" "$CSS_SOURCE"
grep -Fq ".lmf-plate-stack.left" "$CSS_SOURCE"
grep -Fq ".lmf-copy-load" "$CSS_SOURCE"
grep -Fq ".lmf-bar-inventory" "$CSS_SOURCE"
grep -Fq "@media (max-width: 360px)" "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/smart-names-bar-loader-v1.css"

# Older Command V2 patch layers could occasionally leave two complete HTML documents
# concatenated in dist/index.html. Browsers tolerated that malformed shell, but new UI
# utilities should not perpetuate it. Canonicalize to the real Vite app document first,
# then preserve all governed runtime helpers in that one document.
DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()

doctype_re = re.compile(r'<!doctype\s+html[^>]*>', re.I)
matches = list(doctype_re.finditer(text))
if not matches:
    raise SystemExit('index.html is missing <!doctype html>')

if len(matches) > 1:
    candidates = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        close = chunk.lower().rfind('</html>')
        if close >= 0:
            chunk = chunk[:close + len('</html>')]

        compact = chunk.lower()
        score = 0
        score += 100 if 'id="app"' in compact or "id='app'" in compact else 0
        score += 80 if re.search(r'<script[^>]+type=["\']module["\'][^>]+/assets/index-', chunk, re.I) else 0
        score += 40 if '/assets/index-' in chunk else 0
        score += 20 if '/ui/workout-flow-v1.js' in chunk else 0
        score += 20 if '/ui/pyramid-flow-v1.js' in chunk else 0
        score += 20 if '/ui/exercise-art-cloudinary.js' in chunk else 0
        score += 10 if '</body>' in compact else 0
        score += 10 if '</html>' in compact else 0
        candidates.append((score, len(chunk), chunk))

    score, _, winner = max(candidates, key=lambda item: (item[0], item[1]))
    if score < 180:
        raise SystemExit('could not identify the canonical Vite app document while repairing duplicate HTML')
    text = winner
    print(f'Normalized duplicate index.html documents: {len(matches)} -> 1')

# The canonical production shell must retain these governed runtime helpers.
runtime_scripts = [
    '/ui/exercise-art-auto.js',
    '/ui/workout-flow-v1.js',
    '/ui/pyramid-flow-v1.js',
    '/ui/pwa-install.js',
    '/ui/pwa-update.js',
    '/ui/exercise-art-cloudinary.js',
]
if '</body>' not in text.lower():
    raise SystemExit('canonical index.html is missing </body>')
for src in runtime_scripts:
    marker = f'<script defer src="{src}"></script>'
    if src not in text:
        text = re.sub(r'</body>', f'  {marker}\n</body>', text, count=1, flags=re.I)

css = '<link rel="stylesheet" href="/ui/smart-names-bar-loader-v1.css">'
js = '<script defer src="/ui/smart-names-bar-loader-v1.js"></script>'
if css not in text:
    if '</head>' not in text.lower():
        raise SystemExit('canonical index.html is missing </head>')
    text = re.sub(r'</head>', f'  {css}\n</head>', text, count=1, flags=re.I)
if js not in text:
    text = re.sub(r'</body>', f'  {js}\n</body>', text, count=1, flags=re.I)

lower = text.lower()
checks = {
    'doctype': len(doctype_re.findall(text)) == 1,
    'html open': len(re.findall(r'<html\b', text, re.I)) == 1,
    'html close': len(re.findall(r'</html>', text, re.I)) == 1,
    'head open': len(re.findall(r'<head\b', text, re.I)) == 1,
    'head close': len(re.findall(r'</head>', text, re.I)) == 1,
    'body open': len(re.findall(r'<body\b', text, re.I)) == 1,
    'body close': len(re.findall(r'</body>', text, re.I)) == 1,
    'app root': 'id="app"' in lower or "id='app'" in lower,
    'vite module': bool(re.search(r'<script[^>]+type=["\']module["\'][^>]+/assets/index-', text, re.I)),
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit('canonical index.html validation failed: ' + ', '.join(failed))

p.write_text(text.rstrip() + '\n')
PY

node --check "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
test -s "$DIST_DIR/ui/smart-names-bar-loader-v1.css"
grep -Fq '/ui/smart-names-bar-loader-v1.css' "$DIST_DIR/index.html"
grep -Fq '/ui/smart-names-bar-loader-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/workout-flow-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/pyramid-flow-v1.js' "$DIST_DIR/index.html"
grep -Fq '/ui/exercise-art-cloudinary.js' "$DIST_DIR/index.html"
grep -Fq 'Inc DB Press' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Half-Kneeling Chop' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Iron Plates' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Bumper Plates' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'COPY LOAD' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'CLOSEST POSSIBLE' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'lmf-bar-sleeve' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq 'Bar Loader' "$DIST_DIR/ui/smart-names-bar-loader-v1.js"
grep -Fq '@media (max-width: 360px)' "$DIST_DIR/ui/smart-names-bar-loader-v1.css"

DOCTYPE_COUNT="$(grep -io '<!doctype[[:space:]]\+html[^>]*>' "$DIST_DIR/index.html" | wc -l | tr -d ' ')"
[[ "$DOCTYPE_COUNT" == "1" ]]

echo "LetMeFly smart exercise names + locked Bar Loader presets/copy/mirrored sleeve geometry + canonical production shell: PASS"
