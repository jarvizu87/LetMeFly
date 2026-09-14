#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-aq/locked-art-fidelity-v1.css"
ART_SRC="$ROOT_DIR/overlays/ui-command-v2/static/raizen-black-crown-ascension-v1.svg"
SCENE_SRC="$ROOT_DIR/overlays/ui-command-v2/static/mockup-scenes"
HOME_TRAIN_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ar"
TRAIN_BLOCKS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-as/train-block-cards-v1.css"
BRAND_DISPLAY_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-as/brand-display-v1.css"
CSS_OUT="$DIST_DIR/ui/locked-art-fidelity-v1.css"
ART_OUT="$DIST_DIR/ui/raizen-black-crown-ascension-v1.svg"
INDEX="$DIST_DIR/index.html"
SW="$DIST_DIR/service-worker.js"

for required in "$CSS_SRC" "$ART_SRC" "$INDEX" "$SW" "$HOME_TRAIN_SRC/home-train-reference-v1.css" "$HOME_TRAIN_SRC/home-train-reference-v1.js" "$TRAIN_BLOCKS_SRC" "$BRAND_DISPLAY_SRC"; do
  test -s "$required" || { echo "Missing locked-art dependency: $required" >&2; exit 1; }
done

# Presentation/art only. No state, network, exercise-art replacement, or program logic.
! grep -Eq 'localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setItem\(|workoutSessions|trainingMaxHistory|programInstances' "$CSS_SRC"
! grep -Eqi 'exercise[^}]*background-image|library-thumb[^}]*url\(' "$CSS_SRC"
grep -Fq -- "--lmf-raizen-fenrir-art:url('/ui/raizen-black-crown-ascension-v1.svg?v=2')" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='progress'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='exercises'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='coach'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='profile'" "$CSS_SRC"
grep -Fq "data-lmf-approved-route='more'" "$CSS_SRC"
grep -Fq 'data:image/jpeg;base64,' "$ART_SRC"
node "$ROOT_DIR/ci/validate-locked-art-source.mjs" "$ART_SRC"
node "$ROOT_DIR/ci/validate-mockup-scenes.mjs" "$SCENE_SRC"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SRC" "$CSS_OUT"
cp "$ART_SRC" "$ART_OUT"
cp "$HOME_TRAIN_SRC/home-train-reference-v1.css" "$HOME_TRAIN_SRC/home-train-reference-v1.js" "$DIST_DIR/ui/"
cp "$TRAIN_BLOCKS_SRC" "$DIST_DIR/ui/train-block-cards-v1.css"
cp "$BRAND_DISPLAY_SRC" "$DIST_DIR/ui/brand-display-v1.css"
mkdir -p "$DIST_DIR/ui/mockup-scenes"
cp "$SCENE_SRC/"*.svg "$SCENE_SRC/manifest.json" "$DIST_DIR/ui/mockup-scenes/"
cmp -s "$ART_SRC" "$ART_OUT"

# The Train reference layer is materialized here, so presentation bridges that
# depend on that file must be applied only after the copy above.
bash "$ROOT_DIR/ci/install-train-bar-loader-bridge-v1.sh" "$DIST_DIR"
bash "$ROOT_DIR/ci/install-program-mixed-summary-v1.sh" "$DIST_DIR"

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX'])
text=p.read_text()
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/locked-art-fidelity-v1\.css(?:\?v=\d+)?">\s*','\n',text)
tag='<link rel="stylesheet" href="/ui/locked-art-fidelity-v1.css?v=10">'
if not re.search(r'</head>',text,re.I): raise SystemExit('index.html missing </head>')
text=re.sub(r'</head>',f'  {tag}\n</head>',text,count=1,flags=re.I)
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/home-train-reference-v1\.css(?:\?v=\d+)?">\s*','\n',text)
text=re.sub(r'\s*<script defer src="/ui/home-train-reference-v1\.js(?:\?v=\d+)?"></script>\s*','\n',text)
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/train-block-cards-v1\.css(?:\?v=\d+)?">\s*','\n',text)
text=re.sub(r'\s*<link rel="stylesheet" href="/ui/brand-display-v1\.css(?:\?v=\d+)?">\s*','\n',text)
text=re.sub(r'</head>','  <link rel="stylesheet" href="/ui/home-train-reference-v1.css?v=4">\n  <script defer src="/ui/home-train-reference-v1.js?v=6"></script>\n  <link rel="stylesheet" href="/ui/train-block-cards-v1.css?v=5">\n</head>',text,count=1,flags=re.I)
text=re.sub(r'</head>','  <link rel="stylesheet" href="/ui/brand-display-v1.css?v=3">\n</head>',text,count=1,flags=re.I)
text=re.sub(r'/ui/home-reference-v3\.js(?:\?v=\d+)?','/ui/home-reference-v3.js?v=5',text)
opening='<div id="app"><div class="lmf-app-opening" role="status" aria-label="Opening LetMeFly"><img src="/brand/letmefly-logo-display-512.png?v=9" alt="" aria-hidden="true" fetchpriority="high"><strong>LETMEFLY</strong><span>TRAIN HARDER. BECOME MORE.</span></div></div>'
if 'class="lmf-app-opening"' not in text:
    if '<div id="app"></div>' not in text: raise SystemExit('Native empty app root missing')
    text=text.replace('<div id="app"></div>',opening,1)
# This must be the final visual fidelity layer after color harmonization.
if '/ui/color-harmonization-v1.css' in text and text.index('/ui/color-harmonization-v1.css') > text.index('/ui/locked-art-fidelity-v1.css'):
    raise SystemExit('locked-art-fidelity-v1.css must load after color-harmonization-v1.css')
p.write_text(text.rstrip()+'\n')
PY

SW="$SW" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW'])
text=p.read_text()
match=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not match: raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",match.group(1))
required=['/ui/locked-art-fidelity-v1.css','/ui/locked-art-fidelity-v1.css?v=10','/ui/raizen-black-crown-ascension-v1.svg','/ui/raizen-black-crown-ascension-v1.svg?v=2']
required += ['/ui/home-train-reference-v1.'+ext+suffix for ext in ['css','js'] for suffix in ['', '?v=6' if ext == 'js' else '?v=4']]
required += ['/ui/train-block-cards-v1.css','/ui/train-block-cards-v1.css?v=5']
required += ['/ui/brand-display-v1.css','/ui/brand-display-v1.css?v=3','/ui/home-reference-v3.js?v=5']
required += ['/ui/mockup-scenes/'+p.name for p in sorted((p.parent/'ui/mockup-scenes').glob('*.svg'))]
assets=[]
for value in [*existing,*required]:
    if value not in assets: assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(v) for v in assets)+']'
text=text[:match.start()]+replacement+text[match.end():]
# Invalidate only the app shell cache. Athlete storage is unrelated to this cache.
text,count=re.subn(r"(const\s+CACHE_NAME\s*=\s*['\"])([^'\"]+)",lambda m:m.group(1)+re.sub(r'-locked-ui-v\d+$','',m.group(2))+'-locked-ui-v26',text,count=1)
if count != 1: raise SystemExit('service-worker.js CACHE_NAME declaration not found')
p.write_text(text.rstrip()+'\n')
PY

grep -Fq '/ui/locked-art-fidelity-v1.css?v=10' "$INDEX"
grep -Fq "'/ui/locked-art-fidelity-v1.css'" "$SW"
grep -Fq "'/ui/raizen-black-crown-ascension-v1.svg'" "$SW"

# In the full production pipeline the safe refresh/update layer is installed
# earlier. Re-audit it here after branding, tab, color and locked-art layers have
# finished so later presentation work cannot silently strip the PWA update path.
if [[ -s "$DIST_DIR/ui/pwa-update-v1.js" ]]; then
  node "$ROOT_DIR/ci/audit-pwa-update-control-v1.mjs" "$(dirname "$DIST_DIR")"
fi

echo "LetMeFly locked mockup Raizen/Fenrir art fidelity: PASS"