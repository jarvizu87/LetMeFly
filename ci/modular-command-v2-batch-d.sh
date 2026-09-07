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

replacements = [
(
"""        /core|trunk|plank|dead bug|pallof|ab wheel|hollow/.test(filterText) ? 'core' : '',
      ].filter(Boolean).join(' ')
""",
"""        /core|trunk|plank|dead bug|pallof|ab wheel|hollow/.test(filterText) ? 'core' : '',
        /bodyweight|push-up|pull-up|chin-up|dip|split squat|step-up|lunge|calf raise/.test(filterText) ? 'bodyweight' : '',
      ].filter(Boolean).join(' ')
"""
),
(
"""<button data-exercise-filter="carry">Carry</button><button data-exercise-filter="core">Core</button>""",
"""<button data-exercise-filter="carry">Carry</button><button data-exercise-filter="bodyweight">Bodyweight</button><button data-exercise-filter="core">Core</button>"""
),
(
"""<div class="coach-banner"><div class="coach-avatar">♛</div><div><div class="page-kicker">LETMEFLY COACH • ONLINE</div><h1>Your training. Your progression.</h1></div></div>""",
"""<div class="coach-banner"><div class="coach-avatar">♛</div><div class="coach-banner-copy"><div class="page-kicker">YOUR AI TRAINING PARTNER</div><h1>LETMEFLY COACH</h1><p>Always in your corner.</p></div><span class="coach-status">PROGRAM-AWARE</span></div>"""
),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'modular Batch D expected one source block, found {count}: {old[:100]!r}')
    text = text.replace(old, new, 1)

p.write_text(text)
PY

grep -Fq "? 'bodyweight' : ''" "$TARGET_DIR/src/main.ts"
grep -Fq 'data-exercise-filter="bodyweight"' "$TARGET_DIR/src/main.ts"
grep -Fq 'Crownforge + Crown Maintenance names audited against the embedded source library' "$TARGET_DIR/src/main.ts"
grep -Fq 'YOUR AI TRAINING PARTNER' "$TARGET_DIR/src/main.ts"
grep -Fq 'PROGRAM-AWARE' "$TARGET_DIR/src/main.ts"

echo "Command V2 modular Exercises/Coach adapter: PASS"
