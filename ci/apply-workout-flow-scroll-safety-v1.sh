#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
FLOW="$TARGET_DIR/public/ui/workout-flow-v1.js"

if [[ ! -s "$FLOW" ]]; then
  echo "Workout Flow runtime missing: $FLOW" >&2
  exit 1
fi

FLOW="$FLOW" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['FLOW'])
text = p.read_text()
old = """  function scrollActiveTabIntoView(card) {
    const tabs = card.querySelector('.lmf-set-tabs')
    const activeTab = tabs?.querySelector('.lmf-set-tab.active')
    if (!tabs || !activeTab || tabs.scrollWidth <= tabs.clientWidth) return
    window.requestAnimationFrame(() => {
      activeTab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    })
  }
"""
new = """  function scrollActiveTabIntoView(card) {
    const tabs = card.querySelector('.lmf-set-tabs')
    const activeTab = tabs?.querySelector('.lmf-set-tab.active')
    if (!(tabs instanceof HTMLElement) || !(activeTab instanceof HTMLElement) || tabs.scrollWidth <= tabs.clientWidth) return
    window.requestAnimationFrame(() => {
      const centered = activeTab.offsetLeft - (tabs.clientWidth - activeTab.offsetWidth) / 2
      tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })
    })
  }
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected one Workout Flow active-tab scroll function, found {count}')
p.write_text(text.replace(old, new, 1))
PY

node --check "$FLOW"
grep -Fq "const centered = activeTab.offsetLeft - (tabs.clientWidth - activeTab.offsetWidth) / 2" "$FLOW"
grep -Fq "tabs.scrollTo({ left: Math.max(0, centered), behavior: 'smooth' })" "$FLOW"
! grep -Fq "activeTab.scrollIntoView" "$FLOW"

echo "LetMeFly Workout Flow set-tab scroll isolation: PASS"
