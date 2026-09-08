#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
JS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-x/voice-notes-v2.js"
CSS_SOURCE="$ROOT_DIR/overlays/ui-command-v2/batch-x/voice-notes-v2.css"

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "LetMeFly production dist is missing: $DIST_DIR" >&2
  exit 1
fi

test -s "$JS_SOURCE"
test -s "$CSS_SOURCE"
node --check "$JS_SOURCE"
grep -Fq 'SpeechRecognitionPhrase' "$JS_SOURCE"
grep -Fq 'processLocally' "$JS_SOURCE"
grep -Fq 'unspokenPunctuation' "$JS_SOURCE"
grep -Fq "quality: 'dictation'" "$JS_SOURCE"
grep -Fq 'TRAINING_TERMS' "$JS_SOURCE"
grep -Fq 'RPE' "$JS_SOURCE"
grep -Fq 'plates per side' "$JS_SOURCE"
grep -Fq 'VOICE NOTE' "$JS_SOURCE"
grep -Fq 'SMART' "$JS_SOURCE"
grep -Fq '.lmf-voice-note-btn' "$CSS_SOURCE"

mkdir -p "$DIST_DIR/ui"
cp "$JS_SOURCE" "$DIST_DIR/ui/voice-notes-v2.js"
cp "$CSS_SOURCE" "$DIST_DIR/ui/voice-notes-v2.css"
rm -f "$DIST_DIR/ui/voice-notes-v1.js" "$DIST_DIR/ui/voice-notes-v1.css"

DIST_DIR="$DIST_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['DIST_DIR']) / 'index.html'
text = p.read_text()
# Retire v1 if an older pipeline layer injected it.
text = text.replace('  <link rel="stylesheet" href="/ui/voice-notes-v1.css">\n', '')
text = text.replace('  <script defer src="/ui/voice-notes-v1.js"></script>\n', '')
css = '<link rel="stylesheet" href="/ui/voice-notes-v2.css?v=2">'
js = '<script defer src="/ui/voice-notes-v2.js?v=2"></script>'
if css not in text:
    if '</head>' not in text:
        raise SystemExit('index.html is missing </head>')
    text = text.replace('</head>', f'  {css}\n</head>', 1)
if js not in text:
    if '</body>' not in text:
        raise SystemExit('index.html is missing </body>')
    text = text.replace('</body>', f'  {js}\n</body>', 1)
if text.lower().count('<!doctype html>') != 1:
    raise SystemExit('index.html must contain exactly one HTML document')
p.write_text(text)
PY

node --check "$DIST_DIR/ui/voice-notes-v2.js"
test -s "$DIST_DIR/ui/voice-notes-v2.css"
grep -Fq '/ui/voice-notes-v2.css?v=2' "$DIST_DIR/index.html"
grep -Fq '/ui/voice-notes-v2.js?v=2' "$DIST_DIR/index.html"
! grep -Fq '/ui/voice-notes-v1.js' "$DIST_DIR/index.html"
! grep -Fq '/ui/voice-notes-v1.css' "$DIST_DIR/index.html"
grep -Fq 'processLocally' "$DIST_DIR/ui/voice-notes-v2.js"
grep -Fq 'unspokenPunctuation' "$DIST_DIR/ui/voice-notes-v2.js"
grep -Fq 'SpeechRecognitionPhrase' "$DIST_DIR/ui/voice-notes-v2.js"
grep -Fq 'Smart dictation ready' "$DIST_DIR/ui/voice-notes-v2.js"

echo "LetMeFly smart domain-aware voice-note dictation v2: PASS"
