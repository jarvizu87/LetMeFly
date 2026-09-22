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

old_hidden = """    loader.hidden = !loaderSource
"""
new_hidden = """    const exerciseNameForLoader = text(card.querySelector('.exercise-title h3'))
    const barbellForLoader = window.LetMeFlyExercisePresentation?.classify(exerciseNameForLoader).barbell === true
    loader.hidden = !barbellForLoader || (!loaderSource && !window.LetMeFlyBarLoader?.open)
    if (loaderSource) loaderSource.hidden = !barbellForLoader
"""
if old_hidden not in text:
    raise SystemExit('Train reference Bar Loader visibility patch point missing')
text = text.replace(old_hidden, new_hidden, 1)

old_click = """      if (event.target.closest('[data-reference-load-bar]')) card?.querySelector('.exercise-actions [data-lmf-bar-loader-open=\"exercise\"]')?.click()
"""
new_click = """      if (event.target.closest('[data-reference-load-bar]')) {
        const nativeLoader = card?.querySelector('.exercise-actions [data-lmf-bar-loader-open=\"exercise\"]')
        if (nativeLoader) nativeLoader.click()
        else if (card && window.LetMeFlyBarLoader?.open) {
          const exerciseName = text(card.querySelector('.exercise-title h3'))
          const activeRow = card.querySelector('.set-row.lmf-set-active') || card.querySelector('.set-row:not([aria-hidden=\"true\"])') || card.querySelector('.set-row')
          const rawLoad = activeRow?.querySelector('.load-input')?.value || ''
          const target = Number.parseFloat(rawLoad)
          const helper = text(activeRow?.querySelector('.load-field small')).toLowerCase()
          const unit = helper.includes('kg') ? 'kg' : helper.includes('lb') ? 'lb' : null
          window.LetMeFlyBarLoader.open({
            source: 'exercise',
            exerciseName,
            target: Number.isFinite(target) && target > 0 ? target : null,
            unit,
          })
        }
      }
"""
if old_click not in text:
    raise SystemExit('Train reference Bar Loader click bridge patch point missing')
text = text.replace(old_click, new_click, 1)

p.write_text(text)
PY

node --check "$TARGET"
grep -Fq 'exerciseNameForLoader' "$TARGET"
grep -Fq 'window.LetMeFlyBarLoader?.open' "$TARGET"
grep -Fq "source: 'exercise'" "$TARGET"
grep -Fq 'Number.isFinite(target) && target > 0 ? target : null' "$TARGET"

echo "LetMeFly Train reference Bar Loader direct-fallback bridge: PASS"
