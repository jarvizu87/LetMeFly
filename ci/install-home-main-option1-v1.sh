#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-v1.css"
FIDELITY_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-fidelity-v1.css"
CARD_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-card-polish-v1.css"
DESKTOP_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-desktop-bridge-v1.css"
MOCKUP_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-mockup-fidelity-v1.css"
UNIFIED_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-unified-hero-v1.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/home-main-option1-v1.js"
COACH_CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/coach-workspace-v1.css"
COACH_JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/coach-workspace-v1.js"
NAV_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aj/direct-coach-nav-v1.js"
MOUNTAIN_SRC="$ROOT_DIR/overlays/ui-command-v2/static/mountain-foundation.svg"
CINEMATIC_MOUNTAIN_SRC="$ROOT_DIR/overlays/ui-command-v2/static/mountain-command-cinematic-v2.webp"
CSS_OUT="$DIST/ui/home-main-option1-v1.css"
FIDELITY_OUT="$DIST/ui/home-main-option1-fidelity-v1.css"
CARD_OUT="$DIST/ui/home-main-option1-card-polish-v1.css"
DESKTOP_OUT="$DIST/ui/home-main-option1-desktop-bridge-v1.css"
JS_OUT="$DIST/ui/home-main-option1-v1.js"
MOUNTAIN_OUT="$DIST/ui/home-mountain-foundation-v1.svg"
CINEMATIC_MOUNTAIN_OUT="$DIST/ui/home-mountain-cinematic-v2.webp"
FENRIR_OUT="$DIST/ui/fenrir.webp"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"

for required in "$CSS_SRC" "$FIDELITY_SRC" "$CARD_SRC" "$DESKTOP_SRC" "$MOCKUP_SRC" "$UNIFIED_SRC" "$COACH_CSS_SRC" "$COACH_JS_SRC" "$JS_SRC" "$NAV_SRC" "$MOUNTAIN_SRC" "$CINEMATIC_MOUNTAIN_SRC" "$INDEX" "$SW" "$FENRIR_OUT"; do
  test -s "$required" || { echo "Missing Option 1 Home dependency: $required" >&2; exit 1; }
done

node --check "$JS_SRC"
node --check "$NAV_SRC"
node --check "$COACH_JS_SRC"
grep -Fq 'Approved Option 1 Command layout' "$CSS_SRC"
grep -Fq '.lmf-home-option1-progress' "$CSS_SRC"
grep -Fq "grid-template-areas:'readiness performance' 'milestone coach'" "$CSS_SRC"
grep -Fq 'home-mountain-foundation-v1.svg' "$CSS_SRC"
grep -Fq "url('/ui/fenrir.webp')" "$FIDELITY_SRC"
grep -Fq '.lmf-home-v4-command-mark::before' "$FIDELITY_SRC"
grep -Fq '.lmf-home-option1-performance-summary' "$CARD_SRC"
grep -Fq '.lmf-home-option1-copy-dense' "$CARD_SRC"
grep -Fq 'data-lmf-desktop-ui="true"' "$DESKTOP_SRC"
grep -Fq '.lmf-home-brand-lockup' "$DESKTOP_SRC"
grep -Fq 'width:74%!important' "$MOCKUP_SRC"
grep -Fq 'mountain landscape remains dominant' "$MOCKUP_SRC"
grep -Fq "url('/ui/home-mountain-cinematic-v2.webp')" "$MOCKUP_SRC"
grep -Fq 'data-lmf-direct-coach' "$NAV_SRC"
grep -Fq "href = '#/coach'" "$NAV_SRC"
grep -Fq "const HOME_CLASS = 'lmf-home-ref3-active'" "$JS_SRC"
grep -Fq 'ensureProgress' "$JS_SRC"
grep -Fq 'ensureUnifiedHero' "$JS_SRC"
grep -Fq '.lmf-home-option1-hero' "$UNIFIED_SRC"
grep -Fq 'ensurePerformancePresentation' "$JS_SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.(open|deleteDatabase)|workoutSessions.*put|programInstances.*put|fetch\(' "$JS_SRC"
! grep -Eq 'localStorage\.setItem|indexedDB\.(open|deleteDatabase)|fetch\(' "$NAV_SRC"

! grep -Eq 'localStorage\.setItem|sessionStorage\.setItem|indexedDB\.(open|deleteDatabase)|fetch\(' "$COACH_JS_SRC"

mkdir -p "$DIST/ui"
cp "$CSS_SRC" "$CSS_OUT"
cp "$FIDELITY_SRC" "$FIDELITY_OUT"
cp "$CARD_SRC" "$CARD_OUT"
cp "$DESKTOP_SRC" "$DESKTOP_OUT"
cat "$MOCKUP_SRC" >> "$DESKTOP_OUT"
cat "$UNIFIED_SRC" >> "$DESKTOP_OUT"
cat "$COACH_CSS_SRC" >> "$DESKTOP_OUT"
cp "$JS_SRC" "$JS_OUT"
printf '\n;\n' >> "$JS_OUT"
cat "$NAV_SRC" >> "$JS_OUT"
printf '\n;\n' >> "$JS_OUT"
cat "$COACH_JS_SRC" >> "$JS_OUT"
# Keep the historic fallback intact; the final presentation layer uses the
# reference-derived raster through its own versioned URL.
cp "$MOUNTAIN_SRC" "$MOUNTAIN_OUT"
cp "$CINEMATIC_MOUNTAIN_SRC" "$CINEMATIC_MOUNTAIN_OUT"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os, re
p = Path(os.environ['INDEX'])
text = p.read_text()
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-main-option1-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-main-option1-fidelity-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-main-option1-card-polish-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/home-main-option1-desktop-bridge-v1\.css(?:\?v=\d+)?">\s*', '\n', text)
text = re.sub(r'\s*<script defer src="/ui/home-main-option1-v1\.js(?:\?v=\d+)?"></script>\s*', '\n', text)
css = '<link rel="stylesheet" href="/ui/home-main-option1-v1.css?v=1">'
fidelity = '<link rel="stylesheet" href="/ui/home-main-option1-fidelity-v1.css?v=1">'
card = '<link rel="stylesheet" href="/ui/home-main-option1-card-polish-v1.css?v=1">'
desktop = '<link rel="stylesheet" href="/ui/home-main-option1-desktop-bridge-v1.css?v=5">'
js = '<script defer src="/ui/home-main-option1-v1.js?v=3"></script>'
if '</head>' not in text or '</body>' not in text:
    raise SystemExit('production index missing document anchors')
text = text.replace('</head>', f'  {css}\n  {fidelity}\n  {card}\n  {desktop}\n</head>', 1)
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
required = [
    '/ui/home-main-option1-v1.css',
    '/ui/home-main-option1-fidelity-v1.css',
    '/ui/home-main-option1-card-polish-v1.css',
    '/ui/home-main-option1-desktop-bridge-v1.css',
    '/ui/home-main-option1-v1.js',
    '/ui/home-mountain-foundation-v1.svg',
    '/ui/home-mountain-cinematic-v2.webp',
    '/ui/fenrir.webp',
]
assets = []
for value in [*existing, *required]:
    if value not in assets:
        assets.append(value)
replacement = 'const PRECACHE = [' + ', '.join(repr(value) for value in assets) + ']'
text = text[:match.start()] + replacement + text[match.end():]
p.write_text(text.rstrip() + '\n')
PY

node --check "$JS_OUT"
test -s "$CSS_OUT"
test -s "$FIDELITY_OUT"
test -s "$CARD_OUT"
test -s "$DESKTOP_OUT"
test -s "$MOUNTAIN_OUT"
test -s "$CINEMATIC_MOUNTAIN_OUT"
test -s "$FENRIR_OUT"
cmp -s "$MOUNTAIN_OUT" "$MOUNTAIN_SRC"
cmp -s "$CINEMATIC_MOUNTAIN_OUT" "$CINEMATIC_MOUNTAIN_SRC"
grep -Fq 'mountain landscape remains dominant' "$DESKTOP_OUT"
grep -Fq 'data-lmf-direct-coach' "$JS_OUT"
grep -Fq '/ui/home-main-option1-v1.css?v=1' "$INDEX"
grep -Fq '/ui/home-main-option1-fidelity-v1.css?v=1' "$INDEX"
grep -Fq '/ui/home-main-option1-card-polish-v1.css?v=1' "$INDEX"
grep -Fq '/ui/home-main-option1-desktop-bridge-v1.css?v=5' "$INDEX"
grep -Fq '/ui/home-main-option1-v1.js?v=3' "$INDEX"
grep -Fq "'/ui/home-main-option1-v1.css'" "$SW"
grep -Fq "'/ui/home-main-option1-fidelity-v1.css'" "$SW"
grep -Fq "'/ui/home-main-option1-card-polish-v1.css'" "$SW"
grep -Fq "'/ui/home-main-option1-desktop-bridge-v1.css'" "$SW"
grep -Fq "'/ui/home-main-option1-v1.js'" "$SW"
grep -Fq "'/ui/home-mountain-foundation-v1.svg'" "$SW"
grep -Fq "'/ui/home-mountain-cinematic-v2.webp'" "$SW"
grep -Fq "'/ui/fenrir.webp'" "$SW"

echo "LetMeFly approved Option 1 Home install: PASS"
