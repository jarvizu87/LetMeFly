#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET_DIR']) / 'src/main.ts'
text = p.read_text()

if 'async function hydrateReadinessFormFromLatest()' not in text:
    marker = 'async function saveReadinessFromForm(): Promise<void> {'
    if text.count(marker) != 1:
        raise SystemExit(f'expected one saveReadinessFromForm marker, found {text.count(marker)}')
    helper = '''async function hydrateReadinessFormFromLatest(): Promise<void> {
  if (!state.athlete || !state.workout || state.route !== 'train') return
  const latest = await latestReadiness(state.athlete.id)
  if (!latest || state.route !== 'train') return
  const choose = (label: string, value: unknown): void => {
    const numeric = Number(value ?? 0)
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return
    const input = document.querySelector<HTMLInputElement>(`input[name="readiness-${slug(label)}"][value="${numeric}"]`)
    if (input) input.checked = true
  }
  choose('Sleep quality', latest.sleep_quality)
  choose('Energy', latest.energy)
  choose('Soreness', latest.soreness)
  choose('Stress', latest.stress)
  const notes = document.querySelector<HTMLTextAreaElement>('#readiness-notes')
  if (notes) notes.value = String(latest.notes ?? '')
}

'''
    text = text.replace(marker, helper + marker, 1)

bind_marker = '  bindSwipeNavigation()\n'
call = '  if (state.workout) void hydrateReadinessFormFromLatest()\n'
if call not in text:
    if text.count(bind_marker) != 1:
        raise SystemExit(f'expected one bindSwipeNavigation marker, found {text.count(bind_marker)}')
    text = text.replace(bind_marker, bind_marker + call, 1)

p.write_text(text)
PY

grep -Fq 'async function hydrateReadinessFormFromLatest()' "$TARGET_DIR/src/main.ts"
grep -Fq "latestReadiness(state.athlete.id)" "$TARGET_DIR/src/main.ts"
grep -Fq "if (state.workout) void hydrateReadinessFormFromLatest()" "$TARGET_DIR/src/main.ts"
grep -Fq "input[name=\"readiness-\${slug(label)}\"][value=\"\${numeric}\"]" "$TARGET_DIR/src/main.ts"

echo "LetMeFly readiness persistence hotfix: PASS"
