#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
SOURCE_DIR="$ROOT_DIR/overlays/ui-command-v2/batch-an"
MORE_JS_SOURCE="$SOURCE_DIR/more-workspace-v1.js"
MORE_CSS_SOURCE="$SOURCE_DIR/more-workspace-v1.css"
CONSISTENCY_CSS_SOURCE="$SOURCE_DIR/app-consistency-v1.css"
MORE_JS_OUT="$DIST_DIR/ui/more-workspace-v1.js"
MORE_CSS_OUT="$DIST_DIR/ui/more-workspace-v1.css"
CONSISTENCY_CSS_OUT="$DIST_DIR/ui/app-consistency-v1.css"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$MORE_JS_SOURCE" "$MORE_CSS_SOURCE" "$CONSISTENCY_CSS_SOURCE" "$INDEX" "$SW"; do
  test -s "$required"
done

node --check "$MORE_JS_SOURCE"

# Presentation/navigation only: this layer must never become a second data or
# program engine.
! grep -Eq 'localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|\.write\(|setItem\(' "$MORE_JS_SOURCE"
! grep -Eq '#/(nutrition|readiness|testing|utilities|resources|data|support)(["'"'/?#]|$)' "$MORE_JS_SOURCE"
grep -Fq "const ROUTE = '#/more'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Calendar'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Nutrition'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Readiness'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Testing'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Utilities'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Resources'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Data & Backup'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Settings'" "$MORE_JS_SOURCE"
grep -Fq "title: 'Help & Support'" "$MORE_JS_SOURCE"
grep -Fq -- '--lmf-more-accent:#a855f7' "$MORE_CSS_SOURCE"
grep -Fq -- '--lmf-ui-accent:#a855f7' "$CONSISTENCY_CSS_SOURCE"
grep -Fq '.nav-item.active' "$CONSISTENCY_CSS_SOURCE"
grep -Fq '[data-exercise-art]' "$CONSISTENCY_CSS_SOURCE"
grep -Fq '.danger' "$CONSISTENCY_CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$MORE_JS_SOURCE" "$MORE_JS_OUT"
cp "$MORE_CSS_SOURCE" "$MORE_CSS_OUT"
cp "$CONSISTENCY_CSS_SOURCE" "$CONSISTENCY_CSS_OUT"
node --check "$MORE_JS_OUT"

INDEX="$INDEX" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['INDEX'])
text = p.read_text()
more_css = '<link rel="stylesheet" href="/ui/more-workspace-v1.css">'
consistency_css = '<link rel="stylesheet" href="/ui/app-consistency-v1.css">'
more_js = '<script defer src="/ui/more-workspace-v1.js"></script>'

if more_css not in text or consistency_css not in text:
    if not re.search(r'</head>', text, re.I):
        raise SystemExit('index.html is missing </head>')
    links = []
    if more_css not in text:
        links.append(more_css)
    if consistency_css not in text:
        links.append(consistency_css)
    text = re.sub(r'</head>', '  ' + '\n  '.join(links) + '\n</head>', text, count=1, flags=re.I)

if more_js not in text:
    if not re.search(r'</body>', text, re.I):
        raise SystemExit('index.html is missing </body>')
    text = re.sub(r'</body>', f'  {more_js}\n</body>', text, count=1, flags=re.I)

# The consistency layer must be later in the stylesheet cascade than the More
# workspace layer so shared focus/navigation rules can finish the treatment.
if text.index(more_css) > text.index(consistency_css):
    raise SystemExit('app-consistency-v1.css must load after more-workspace-v1.css')

p.write_text(text.rstrip() + '\n')
PY

SW="$SW" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['SW'])
text = p.read_text()
match = re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]", text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
required = [
    '/ui/more-workspace-v1.js',
    '/ui/more-workspace-v1.css',
    '/ui/app-consistency-v1.css',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

grep -Fq '/ui/more-workspace-v1.js' "$INDEX"
grep -Fq '/ui/more-workspace-v1.css' "$INDEX"
grep -Fq '/ui/app-consistency-v1.css' "$INDEX"
grep -Fq "'/ui/more-workspace-v1.js'" "$SW"
grep -Fq "'/ui/more-workspace-v1.css'" "$SW"
grep -Fq "'/ui/app-consistency-v1.css'" "$SW"

echo "LetMeFly More workspace + app consistency v1: PASS"
