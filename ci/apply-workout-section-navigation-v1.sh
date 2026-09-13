#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET']) / 'src/main.ts'
s = p.read_text()
start = s.index('function bindSwipeNavigation(): void {')
end = s.index('\nasync function ', start)
block = s[start:end]
assert 'lmfSectionNavigation' not in block, 'Section navigation guard already installed'
old = '  let frame = 0\n'
new = '''  let frame = 0
  let horizontalGestureUntil = 0
  let gesturePointer: { id: number; x: number; y: number } | null = null
  viewport.dataset.lmfSectionNavigation = 'intent-v1'
  const markHorizontalGesture = (): void => { horizontalGestureUntil = Date.now() + 500 }
  viewport.addEventListener('wheel', (event) => {
    if (event.isTrusted && Math.abs(event.deltaX) > Math.abs(event.deltaY)) markHorizontalGesture()
  }, { passive: true })
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted) return
    gesturePointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    const bounds = viewport.getBoundingClientRect()
    if (event.pointerType === 'mouse' && event.clientY >= bounds.top + viewport.clientTop + viewport.clientHeight) markHorizontalGesture()
  }, { passive: true })
  viewport.addEventListener('pointermove', (event) => {
    const pointer = gesturePointer
    if (!event.isTrusted || !pointer || event.pointerId !== pointer.id) return
    const dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y)
    if (dx > 12 && dx > dy) markHorizontalGesture()
  }, { passive: true })
  for (const type of ['pointerup', 'pointercancel']) viewport.addEventListener(type, () => { gesturePointer = null }, { passive: true })
  viewport.addEventListener('keydown', (event) => {
    if (event.isTrusted && event.target === viewport && ['ArrowLeft', 'ArrowRight'].includes(event.key)) markHorizontalGesture()
  })
'''
assert block.count(old) == 1
block = block.replace(old, new, 1)
old = '  const goTo = (index: number): void => {\n'
assert block.count(old) == 1
block = block.replace(old, old + '    horizontalGestureUntil = 0\n', 1)
old = '''    frame = requestAnimationFrame(() => {
      const center = viewport.scrollLeft + viewport.clientWidth / 2'''
new = '''    frame = requestAnimationFrame(() => {
      // Focus/reveal scrolling must not select a different workout block. The
      // controls select immediately; only a deliberate horizontal gesture may
      // derive selection from scroll position. Keep momentum in that gesture.
      if (Date.now() > horizontalGestureUntil) return
      horizontalGestureUntil = Date.now() + 500
      const center = viewport.scrollLeft + viewport.clientWidth / 2'''
assert block.count(old) == 1
block = block.replace(old, new, 1)
p.write_text(s[:start] + block + s[end:])
PY
echo "LetMeFly native workout section intent guard: PASS"
