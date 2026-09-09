#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
MAIN="$TARGET_DIR/src/main.ts"

if [[ ! -s "$MAIN" ]]; then
  echo "LetMeFly main source missing: $MAIN" >&2
  exit 1
fi

MAIN="$MAIN" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['MAIN'])
text = p.read_text()
old = """  await refreshWorkout()
  state.cloud.syncSoon()
  showToast(alreadyDone ? 'Set reopened locally' : 'Set saved locally')
}"""
new = """  await refreshWorkout()
  const refreshedStats = state.workout ? completionStats(state.workout) : null
  if (refreshedStats) {
    const reviewPanel = document.querySelector<HTMLElement>('.review-panel')
    const reviewHeading = reviewPanel?.querySelector<HTMLElement>('h2')
    if (reviewHeading) reviewHeading.textContent = `${refreshedStats.done} / ${refreshedStats.total} sets logged`
    const reviewProgress = reviewPanel?.querySelector<HTMLElement>('.progress-bar.large > span')
    if (reviewProgress) reviewProgress.style.width = `${refreshedStats.percent}%`
  }
  state.cloud.syncSoon()
  showToast(alreadyDone
    ? `Set reopened locally${refreshedStats ? ` • ${refreshedStats.done}/${refreshedStats.total}` : ''}`
    : `Set saved locally${refreshedStats ? ` • ${refreshedStats.done}/${refreshedStats.total}` : ''}`)
}"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one native set-save refresh boundary, found {count}')
p.write_text(text.replace(old, new, 1))
PY

grep -Fq "const refreshedStats = state.workout ? completionStats(state.workout) : null" "$MAIN"
grep -Fq "document.querySelector<HTMLElement>('.review-panel')" "$MAIN"
grep -Fq "reviewHeading.textContent = \`\${refreshedStats.done} / \${refreshedStats.total} sets logged\`" "$MAIN"
grep -Fq "reviewProgress.style.width = \`\${refreshedStats.percent}%\`" "$MAIN"
grep -Fq "Set saved locally\${refreshedStats ? \` • \${refreshedStats.done}/\${refreshedStats.total}\` : ''}" "$MAIN"

echo "LetMeFly authoritative live Session Review count refresh: PASS"
