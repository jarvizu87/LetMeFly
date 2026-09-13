#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
TARGET="$DIST_DIR/ui/home-train-reference-v1.js"

test -s "$TARGET" || { echo "Missing Train reference runtime: $TARGET" >&2; exit 1; }

TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET'])
text = p.read_text()
old = """      const first = rows[0]\n      const detail = rows.length > 1 ? `${rows.length} sets · ${text(first?.querySelector('span'))}` : [text(first?.querySelector('strong')),text(first?.querySelector('span'))].filter(Boolean).join(' · ')\n"""
new = """      const first = rows[0]\n      const rowDetails = rows.map(row => text(row.querySelector('span'))).filter(Boolean)\n      const groups = []\n      for (const value of rowDetails) {\n        const previous = groups[groups.length - 1]\n        if (previous?.value === value) previous.count += 1\n        else groups.push({ value, count: 1 })\n      }\n      const groupedDetail = groups.map(group => `${group.count}× ${group.value}`).join(' + ')\n      const detail = rows.length > 1 ? groupedDetail : [text(first?.querySelector('strong')),text(first?.querySelector('span'))].filter(Boolean).join(' · ')\n"""
if old not in text:
    raise SystemExit('mixed prescription summary patch point missing')
text = text.replace(old, new, 1)
p.write_text(text)
PY

node --check "$TARGET"
grep -Fq 'const rowDetails = rows.map' "$TARGET"
grep -Fq 'const groupedDetail = groups.map' "$TARGET"
grep -Fq "join(' + ')" "$TARGET"
! grep -Fq '`${rows.length} sets · ${text(first?.querySelector' "$TARGET"

echo "LetMeFly mixed-set compact prescription summary: PASS"
