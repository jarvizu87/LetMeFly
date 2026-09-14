#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/ci/audit-browser-smoke.mjs"
TMP="$ROOT_DIR/ci/.audit-browser-smoke-parity-v2-${BASHPID}.mjs"
trap 'rm -f "$TMP"' EXIT
SRC="$SRC" TMP="$TMP" python3 - <<'PY'
from pathlib import Path
import os
src=Path(os.environ['SRC']).read_text()
old="""return {before:getComputedStyle(el,'::before').display, position:style?.position, fit:style?.backgroundSize, height:media?.getBoundingClientRect().height}"""
new="""return {before:getComputedStyle(el,'::before').display, position:style?.position, fit:style?.backgroundSize, height:media?.getBoundingClientRect().height, width:media?.getBoundingClientRect().width}"""
if src.count(old)!=1: raise SystemExit(f'Expected one future-card visual probe, found {src.count(old)}')
src=src.replace(old,new,1)
old="""const rows = details.locator(':scope > .prescription-row')"""
new="""const readonly = card.locator('.lmf-preview-readonly-logger').first()\n    const rows = details.locator('.prescription-row')"""
if src.count(old)!=1: raise SystemExit(f'Expected one future-card prescription-row probe, found {src.count(old)}')
src=src.replace(old,new,1)
old="""if (visual.before !== 'none' || visual.position !== 'absolute' || visual.fit !== 'contain' || visual.height > 210) {
      fail('Future-day integrated exercise card', `unexpected art geometry: ${JSON.stringify(visual)}`)
    } else if (!(await details.isVisible()) || !values.length || values.some(row=>!row.label||!row.detail)) {
      fail('Future-day governed prescriptions', 'complete native set labels and prescriptions must remain visible')
    } else {
      pass('Future-day integrated exercise card', 'compact art region with native prescription table')
      pass('Future-day governed prescriptions', `${values.length} original set rows retained`)
    }"""
new="""const squareish = Number.isFinite(visual.width) && Number.isFinite(visual.height) && Math.abs(visual.width - visual.height) <= 4
    if (visual.before !== 'none' || visual.position !== 'relative' || visual.fit !== 'contain' || visual.height < 240 || !squareish) {
      fail('Future-day integrated exercise card', `unexpected full-card art geometry: ${JSON.stringify(visual)}`)
    } else if (!(await details.isVisible()) || !(await readonly.isVisible()) || !values.length || values.some(row=>!row.label||!row.detail)) {
      fail('Future-day governed prescriptions', 'full read-only set-card prescription must remain visible')
    } else {
      pass('Future-day integrated exercise card', 'full square premium art region with read-only prescription cards')
      pass('Future-day governed prescriptions', `${values.length} original set rows retained`)
    }"""
if src.count(old)!=1: raise SystemExit(f'Expected one stale compact-art assertion, found {src.count(old)}')
src=src.replace(old,new,1)
Path(os.environ['TMP']).write_text(src)
PY
node --check "$TMP"
node "$TMP"
