#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/services/workout-service.ts" ]]; then
  echo "Usage: $0 <letmefly_app_source_dir>" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET_DIR']) / 'src/services/workout-service.ts'
text = p.read_text()

old_import = "import type { ProgramDay, ProgramExercise, ProgramSet } from '../program-engine/types'"
new_import = "import type { ProgramDay, ProgramExercise, ProgramSet, PublicProgramKey } from '../program-engine/types'"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('workout-service type import marker not found')

old_key = "  programKey: 'crownforge' | 'crown-maintenance',"
new_key = "  programKey: PublicProgramKey,"
if old_key in text:
    text = text.replace(old_key, new_key, 1)
elif new_key not in text:
    raise SystemExit('startWorkout programKey marker not found')

old_version = "        program_version: 'v2.1',"
new_version = "        program_version: programKey === 'black-crown' ? 'v2.0' : 'v2.1',"
if old_version in text:
    text = text.replace(old_version, new_version, 1)
elif new_version not in text:
    raise SystemExit('workout program_version marker not found')

old_phase = "        phase_key: programKey === 'crown-maintenance' ? 'maintenance' : week <= 12 ? 'build' : 'testing',"
new_phase = "        phase_key: programKey === 'black-crown' ? `block-${Math.ceil(week / 6)}` : programKey === 'crown-maintenance' ? 'maintenance' : week <= 12 ? 'build' : 'testing',"
if old_phase in text:
    text = text.replace(old_phase, new_phase, 1)
elif new_phase not in text:
    raise SystemExit('workout phase marker not found')

old_date = "        scheduled_for: day.date,"
new_date = "        scheduled_for: day.date ?? null,"
if old_date in text:
    text = text.replace(old_date, new_date, 1)
elif new_date not in text:
    raise SystemExit('workout scheduled_for marker not found')

p.write_text(text)
PY

grep -Fq "programKey: PublicProgramKey" "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq "programKey === 'black-crown' ? 'v2.0' : 'v2.1'" "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq 'Math.ceil(week / 6)' "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq 'scheduled_for: day.date ?? null' "$TARGET_DIR/src/services/workout-service.ts"

echo "Black Crown workout persistence support: PASS"
