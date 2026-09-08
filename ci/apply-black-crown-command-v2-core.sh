#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" ]]; then
  echo "Usage: $0 <letmefly_app_source_dir>" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET_DIR']) / 'src/main.ts'
text = p.read_text()

old_import = "import { CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN, getCalendarDay, getCrownforgeDay, getCrownforgeWeek, getCrownMaintenanceDay, getCrownMaintenanceWeek, type CalendarProgramKey, type ProgramDay, type ProgramExercise, type ProgramWeek } from './data/programs'"
new_import = "import { CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN, getCalendarDay, getCrownforgeDay, getCrownforgeWeek, getCrownMaintenanceDay, getCrownMaintenanceWeek, getBlackCrownDay, getBlackCrownWeek, type PublicProgramKey, type ProgramDay, type ProgramExercise, type ProgramWeek } from './data/programs'"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('main program import marker not found')

old_state = '  selectedProgram: CalendarProgramKey\n'
new_state = '  selectedProgram: PublicProgramKey\n'
if old_state in text:
    text = text.replace(old_state, new_state, 1)
elif new_state not in text:
    raise SystemExit('selectedProgram type marker not found')

old_day = """function getProgramDay(program: CalendarProgramKey, week: number, day: number): ProgramDay | null {
  return program === 'crown-maintenance' ? getCrownMaintenanceDay(week, day) : getCrownforgeDay(week, day)
}"""
new_day = """function getProgramDay(program: PublicProgramKey, week: number, day: number): ProgramDay | null {
  return program === 'black-crown' ? getBlackCrownDay(week, day) : program === 'crown-maintenance' ? getCrownMaintenanceDay(week, day) : getCrownforgeDay(week, day)
}"""
if old_day in text:
    text = text.replace(old_day, new_day, 1)
elif new_day not in text:
    raise SystemExit('getProgramDay marker not found')

old_week = """function getProgramWeek(program: CalendarProgramKey, week: number): ProgramWeek | null {
  return program === 'crown-maintenance' ? getCrownMaintenanceWeek(week) : getCrownforgeWeek(week)
}"""
new_week = """function getProgramWeek(program: PublicProgramKey, week: number): ProgramWeek | null {
  return program === 'black-crown' ? getBlackCrownWeek(week) : program === 'crown-maintenance' ? getCrownMaintenanceWeek(week) : getCrownforgeWeek(week)
}"""
if old_week in text:
    text = text.replace(old_week, new_week, 1)
elif new_week not in text:
    raise SystemExit('getProgramWeek marker not found')

old_name = """function selectedProgramName(): string {
  return state.selectedProgram === 'crown-maintenance' ? CROWN_MAINTENANCE.name : CROWNFORGE.name
}"""
new_name = """function selectedProgramName(): string {
  return state.selectedProgram === 'black-crown' ? BLACK_CROWN.name : state.selectedProgram === 'crown-maintenance' ? CROWN_MAINTENANCE.name : CROWNFORGE.name
}"""
if old_name in text:
    text = text.replace(old_name, new_name, 1)
elif new_name not in text:
    raise SystemExit('selectedProgramName marker not found')

text = text.replace("<span>${state.selectedProgram === 'crown-maintenance' ? 'CM' : 'CF'} • W${state.selectedWeek} • D${state.selectedDay}</span>", "<span>${state.selectedProgram === 'black-crown' ? 'BC' : state.selectedProgram === 'crown-maintenance' ? 'CM' : 'CF'} • W${state.selectedWeek} • D${state.selectedDay}</span>", 1)
text = text.replace("  const homeProgram = today?.program ?? state.selectedProgram\n", "  const homeProgram: PublicProgramKey = today?.program ?? state.selectedProgram\n", 1)

p.write_text(text)
PY

MAIN="$TARGET_DIR/src/main.ts"
grep -Fq 'selectedProgram: PublicProgramKey' "$MAIN"
grep -Fq "program === 'black-crown' ? getBlackCrownDay" "$MAIN"
grep -Fq "program === 'black-crown' ? getBlackCrownWeek" "$MAIN"
grep -Fq "state.selectedProgram === 'black-crown' ? BLACK_CROWN.name" "$MAIN"
grep -Fq "state.selectedProgram === 'black-crown' ? 'BC'" "$MAIN"

echo "Command V2 Black Crown core routing: PASS"
