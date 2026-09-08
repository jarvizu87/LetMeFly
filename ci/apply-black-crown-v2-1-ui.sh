#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" || ! -f "$TARGET/src/main.ts" ]]; then
  echo "Usage: $0 <letmefly_app_source_dir>" >&2
  exit 1
fi

TARGET="$TARGET" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET']) / 'src/main.ts'
text = p.read_text()

replacements = [
    (
        '54 governed weeks • 270 sessions • nine six-week blocks • Black Crown Revised v2.0.',
        '54 governed weeks • 270 sessions • nine six-week blocks • Black Crown Revised v2.1.',
    ),
    (
        "${homeProgram === 'black-crown' ? 'v2.0' : 'v2.1'}",
        "${homeProgram === 'black-crown' ? 'v2.1' : 'v2.1'}",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Black Crown v2.1 UI patch expected one marker, found {count}: {old}')
    text = text.replace(old, new, 1)

if 'Black Crown Revised v2.0.' in text:
    raise SystemExit('stale Black Crown v2.0 Program-page source label remains')

p.write_text(text)
PY

grep -Fq 'Black Crown Revised v2.1.' "$TARGET/src/main.ts"
grep -Fq "homeProgram === 'black-crown' ? 'v2.1' : 'v2.1'" "$TARGET/src/main.ts"
! grep -Fq 'Black Crown Revised v2.0.' "$TARGET/src/main.ts"

echo "Black Crown v2.1 UI version labels: PASS"
