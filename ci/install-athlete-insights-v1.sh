#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
test -s "$DIST_DIR/index.html"
test -s "$DIST_DIR/service-worker.js"
node --test "$ROOT_DIR/ci/audit-athlete-insights.mjs" "$ROOT_DIR/ci/audit-progress-detail.mjs"
mkdir -p "$DIST_DIR/ui/athlete-insights-v1"
for file in athlete-insights.mjs private-history.mjs progress-detail.mjs progress-detail-ui.mjs athlete-insights-ui.mjs coach-rule-manifest.json athlete-insights.css; do
  cp "$ROOT_DIR/overlays/athlete-insights-v1/$file" "$DIST_DIR/ui/athlete-insights-v1/$file"
done
for file in athlete-insights.mjs private-history.mjs progress-detail.mjs progress-detail-ui.mjs athlete-insights-ui.mjs; do node --check "$DIST_DIR/ui/athlete-insights-v1/$file"; done
DIST_DIR="$DIST_DIR" python3 - <<'PY'
import os, pathlib, re
dist = pathlib.Path(os.environ['DIST_DIR'])
p = dist/'index.html'
text = p.read_text()
css = '<link rel="stylesheet" href="/ui/athlete-insights-v1/athlete-insights.css">'
js = '<script type="module" src="/ui/athlete-insights-v1/athlete-insights-ui.mjs"></script>'
assert '</head>' in text and '</body>' in text
if css not in text: text = text.replace('</head>', css+'\n</head>', 1)
if js not in text: text = text.replace('</body>', js+'\n</body>', 1)
p.write_text(text)
p = dist/'service-worker.js'
text = p.read_text()
m = re.search(r'const\s+PRECACHE\s*=\s*\[([^\]]*)\]', text)
assert m, 'Missing offline asset list'
assets = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
assets += ['/ui/athlete-insights-v1/'+name for name in ['athlete-insights.mjs','private-history.mjs','progress-detail.mjs','progress-detail-ui.mjs','athlete-insights-ui.mjs','coach-rule-manifest.json','athlete-insights.css']]
text = text[:m.start()]+'const PRECACHE = ['+', '.join(repr(a) for a in dict.fromkeys(assets))+']'+text[m.end():]
p.write_text(text)
PY
echo 'LetMeFly athlete-aware Progress and Coach: installed'
