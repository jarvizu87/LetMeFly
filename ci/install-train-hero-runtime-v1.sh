#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
RUNTIME_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-av/train-hero-runtime-v1.js"
MANIFEST="$ROOT_DIR/overlays/ui-command-v2/static/train-heroes-v1/manifest.json"
REFERENCE_JS="$DIST/ui/home-train-reference-v1.js"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
OUT_DIR="$DIST/ui/train-heroes-v1"
RUNTIME_OUT="$DIST/ui/train-hero-runtime-v1.js"

for required in "$RUNTIME_SRC" "$MANIFEST" "$REFERENCE_JS" "$INDEX" "$SW"; do
  test -s "$required" || { echo "Missing Train hero runtime dependency: $required" >&2; exit 1; }
done

node --check "$RUNTIME_SRC"
node "$ROOT_DIR/ci/validate-train-hero-art-pack-v1.mjs"
! grep -Eq 'localStorage\.(setItem|removeItem)|sessionStorage\.(setItem|removeItem)|indexedDB|workoutSessions|programInstances|trainingMax|Math\.random' "$RUNTIME_SRC"
grep -Fq "window.__LMF_TRAIN_HERO_V1__" "$RUNTIME_SRC"
grep -Fq "data-lmf-train-hero-key" "$RUNTIME_SRC" || true

mkdir -p "$OUT_DIR"

fetch_hero() {
  local file="$1" url="$2" tmp="$OUT_DIR/.${file}.tmp"
  curl -fsSL --retry 3 --retry-delay 1 --connect-timeout 15 "$url" -o "$tmp"
  test -s "$tmp" || { echo "Downloaded Train hero is empty: $file" >&2; exit 1; }
  FILE="$tmp" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['FILE'])
data=p.read_bytes()
if len(data) < 10000:
    raise SystemExit(f'Hero delivery is unexpectedly small: {p} ({len(data)} bytes)')
if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
    raise SystemExit(f'Hero delivery is not WEBP: {p}')
PY
  mv "$tmp" "$OUT_DIR/$file"
}

fetch_hero 'train-hero-v1-squat-lower-strength.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789449964/train-hero-v1-squat-lower-strength.webp'
fetch_hero 'train-hero-v1-bench-upper-push.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789449975/train-hero-v1-bench-upper-push.webp'
fetch_hero 'train-hero-v1-deadlift-posterior-chain.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789449985/train-hero-v1-deadlift-posterior-chain.webp'
fetch_hero 'train-hero-v1-olympic-explosive.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789449993/train-hero-v1-olympic-explosive.webp'
fetch_hero 'train-hero-v1-conditioning-carries.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789450003/train-hero-v1-conditioning-carries.webp'
fetch_hero 'train-hero-v1-accessory-recovery-work-capacity.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789450013/train-hero-v1-accessory-recovery-work-capacity.webp'
fetch_hero 'train-hero-v1-yoke-trap-strength.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789450022/train-hero-v1-yoke-trap-strength.webp'
fetch_hero 'train-hero-v1-overhead-vertical-strength.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789450031/train-hero-v1-overhead-vertical-strength.webp'
fetch_hero 'train-hero-v1-realization-testing-crown-day.webp' 'https://res.cloudinary.com/extor5az/image/upload/v1789450040/train-hero-v1-realization-testing-crown-day.webp'

cp "$RUNTIME_SRC" "$RUNTIME_OUT"

REFERENCE_JS="$REFERENCE_JS" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['REFERENCE_JS'])
text=p.read_text()
old='<img src="/ui/train-lifter.webp" alt="" decoding="async">'
new='<img alt="" decoding="async" fetchpriority="high">'
count=text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one retired hard-coded Train hero, found {count}')
p.write_text(text.replace(old,new,1).rstrip()+'\n')
PY

INDEX="$INDEX" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['INDEX'])
text=p.read_text()
text=re.sub(r'\s*<script defer src="/ui/train-hero-runtime-v1\.js(?:\?v=\d+)?"></script>\s*','\n',text)
if '</body>' not in text.lower():
    raise SystemExit('index.html missing </body>')
tag='<script defer src="/ui/train-hero-runtime-v1.js?v=1"></script>'
text=re.sub(r'</body>',f'  {tag}\n</body>',text,count=1,flags=re.I)
p.write_text(text.rstrip()+'\n')
PY

SW="$SW" OUT_DIR="$OUT_DIR" python3 - <<'PY'
from pathlib import Path
import os,re
p=Path(os.environ['SW'])
text=p.read_text()
match=re.search(r"const\s+PRECACHE\s*=\s*\[([^\]]*)\]",text)
if not match:
    raise SystemExit('service-worker.js PRECACHE declaration not found')
existing=re.findall(r"['\"]([^'\"]+)['\"]",match.group(1))
hero_files=sorted(Path(os.environ['OUT_DIR']).glob('train-hero-v1-*.webp'))
if len(hero_files) != 9:
    raise SystemExit(f'Expected nine materialized Train heroes, found {len(hero_files)}')
required=['/ui/train-hero-runtime-v1.js','/ui/train-hero-runtime-v1.js?v=1']+[f'/ui/train-heroes-v1/{item.name}' for item in hero_files]
assets=[]
for value in [*existing,*required]:
    if value not in assets:
        assets.append(value)
replacement='const PRECACHE = ['+', '.join(repr(value) for value in assets)+']'
text=text[:match.start()]+replacement+text[match.end():]
cache=re.search(r"const\s+CACHE_NAME\s*=\s*['\"]([^'\"]+)['\"]",text)
if not cache:
    raise SystemExit('service-worker.js CACHE_NAME declaration not found')
name=cache.group(1)
if not name.endswith('-train-hero-v1'):
    name=re.sub(r'-train-hero-v1$','',name)+'-train-hero-v1'
text=text[:cache.start(1)]+name+text[cache.end(1):]
p.write_text(text.rstrip()+'\n')
PY

node --check "$RUNTIME_OUT"
test "$(find "$OUT_DIR" -maxdepth 1 -type f -name 'train-hero-v1-*.webp' | wc -l)" = "9"
grep -Fq '/ui/train-hero-runtime-v1.js?v=1' "$INDEX"
grep -Fq "'/ui/train-hero-runtime-v1.js'" "$SW"
grep -Fq "'/ui/train-heroes-v1/train-hero-v1-squat-lower-strength.webp'" "$SW"
grep -Fq 'train-hero-v1' "$SW"
! grep -Fq 'src="/ui/train-lifter.webp"' "$REFERENCE_JS"
! grep -Eq 'localStorage\.(setItem|removeItem)|sessionStorage\.(setItem|removeItem)|indexedDB|workoutSessions|programInstances|trainingMax|Math\.random' "$RUNTIME_OUT"

echo 'LetMeFly Train Hero Runtime V1 install: PASS'
