#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
CSS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ad/profile-v2.css"
JS_SRC="$ROOT_DIR/overlays/ui-command-v2/batch-ad/profile-v2.js"
INDEX="$DIST_DIR/index.html"

for f in "$INDEX" "$CSS_SRC" "$JS_SRC"; do
  test -s "$f" || { echo "Missing required Profile v2 asset: $f" >&2; exit 1; }
done

node --check "$JS_SRC"
grep -Fq "const DB_NAME = 'letmefly-private'" "$JS_SRC"
grep -Fq "const CONTEXT_KEY = 'profile_context_v2'" "$JS_SRC"
grep -Fq 'lmf-profile-v2' "$JS_SRC"
grep -Fq 'SAVE ATHLETE CONTEXT' "$JS_SRC"
grep -Fq 'Private Athlete Context' "$JS_SRC"
grep -Fq 'await bridge.save(vault.athlete.id, patch, expected)' "$JS_SRC"
! grep -Fq "transaction('athletes', 'readwrite')" "$JS_SRC"
! grep -Eq "objectStore\(['\"](programInstances|workoutSessions|trainingMaxHistory|personalRecords|bodyweightEntries)['\"]\)\.put" "$JS_SRC"
! grep -Eq 'CROWNFORGE|BLACK_CROWN|prescription|sets.*=|reps.*=' "$JS_SRC"
grep -Fq '.lmf-profile-v2' "$CSS_SRC"
grep -Fq '.lmf-profile-savebar' "$CSS_SRC"

mkdir -p "$DIST_DIR/ui"
cp "$CSS_SRC" "$DIST_DIR/ui/profile-v2.css"
cp "$JS_SRC" "$DIST_DIR/ui/profile-v2.js"

DIST_DIR="$DIST_DIR" python3 - <<'PY'
from pathlib import Path
import os, re

root = Path(os.environ['DIST_DIR'])
index = root / 'index.html'
text = index.read_text()
css = '<link rel="stylesheet" href="/ui/profile-v2.css?v=3">'
js = '<script defer src="/ui/profile-v2.js?v=3"></script>'

# Remove stale Profile v2 injection if an old artifact is reprocessed.
text = re.sub(r'\s*<link rel="stylesheet" href="/ui/profile-v2\.css\?v=[^"]+">', '', text)
text = re.sub(r'\s*<script defer src="/ui/profile-v2\.js\?v=[^"]+"></script>', '', text)

if css not in text:
    text = text.replace('</head>', f'  {css}\n</head>', 1)
if js not in text:
    text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one document')
index.write_text(text)
# Cache the matching editor version for offline use with the bundled save bridge.
worker = root / 'service-worker.js'
text = worker.read_text()
match = re.search(r'const\s+PRECACHE\s*=\s*\[([^\]]*)\]', text)
if not match: raise SystemExit('Missing offline asset list')
assets = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
assets = [asset for asset in assets if not re.match(r'/ui/profile-v2\.(?:css|js)(?:\?|$)', asset)]
assets += ['/ui/profile-v2.css?v=3', '/ui/profile-v2.js?v=3']
text = text[:match.start()] + 'const PRECACHE = [' + ', '.join(repr(a) for a in dict.fromkeys(assets)) + ']' + text[match.end():]
worker.write_text(text)
PY

node --check "$DIST_DIR/ui/profile-v2.js"
test -s "$DIST_DIR/ui/profile-v2.css"
grep -Fq '/ui/profile-v2.css?v=3' "$INDEX"
grep -Fq '/ui/profile-v2.js?v=3' "$INDEX"

echo "LetMeFly private athlete Profile v2: PASS"
