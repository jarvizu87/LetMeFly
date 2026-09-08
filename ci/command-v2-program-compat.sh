#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-}"
TARGET_DIR="${2:-}"

if [[ "$MODE" != "pre" && "$MODE" != "post" ]]; then
  echo "Usage: $0 <pre|post> <letmefly_app_source_dir>" >&2
  exit 1
fi
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

MODE="$MODE" TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

mode = os.environ['MODE']
p = Path(os.environ['TARGET_DIR']) / 'src/main.ts'
text = p.read_text()

modular = '''}function homePage(): string {
  const today = getCalendarDay(new Date())
  const homeProgram = today?.program ?? state.selectedProgram
  const day = getProgramDay(homeProgram, today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)
  const beforeStart = new Date() < new Date('2026-09-07T00:00:00')
  const title = beforeStart ? 'LOWER + BENCH FREQUENCY + GLUTES' : day ? day.title : 'CROWNFORGE'
  const sub = beforeStart ? 'Foundation • Week 1 • Day 1 • Sep 7' : day ? `${homeProgram === 'crown-maintenance' ? 'Crown Maintenance • ' : ''}Week ${today?.week} • Day ${today?.day}` : 'Your current training block'
  const completed = state.workout ? completionStats(state.workout) : { done: 0, total: 0, percent: 0 }
  const focus = (day?.sections ?? []).slice(0, 4).map((section, index) => `<div class="focus-chip"><span>${['01','02','03','04'][index] ?? '•'}</span>${esc(section.title.replace(/^\\w+\\s*•?\\s*/, ''))}</div>`).join('')
'''

legacy_expected = '''}function homePage(): string {
  const today = getCalendarDay(new Date())
  const day = getCrownforgeDay(today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)
  const beforeStart = new Date() < new Date('2026-09-07T00:00:00')
  const title = beforeStart ? 'LOWER + BENCH FREQUENCY + GLUTES' : day ? day.title : 'CROWNFORGE'
  const sub = beforeStart ? 'Foundation • Week 1 • Day 1 • Sep 7' : day ? `Week ${today?.week} • Day ${today?.day}` : 'Your current training block'
  const completed = state.workout ? completionStats(state.workout) : { done: 0, total: 0, percent: 0 }
  const focus = (day?.sections ?? []).slice(0, 4).map((section, index) => `<div class="focus-chip"><span>${['01','02','03','04'][index] ?? '•'}</span>${esc(section.title.replace(/^\\w+\\s*•?\\s*/, ''))}</div>`).join('')
'''

command_v2_result = '''}function homePage(): string {
  const today = getCalendarDay(new Date())
  const day = getCrownforgeDay(today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)
  const title = day?.title ?? 'CROWNFORGE'
  const sub = day ? `Crownforge • Week ${today?.week ?? state.selectedWeek} • Day ${today?.day ?? state.selectedDay}` : 'Your current training block'
  const completed = state.workout ? completionStats(state.workout) : { done: 0, total: 0, percent: 0 }
  const focus = (day?.sections ?? []).slice(0, 4).map((section, index) => `<div class="focus-chip"><span>${['01','02','03','04'][index] ?? '•'}</span>${esc(section.title)}</div>`).join('')
'''

program_aware_result = '''}function homePage(): string {
  const today = getCalendarDay(new Date())
  const homeProgram = today?.program ?? state.selectedProgram
  const homeProgramName = homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : homeProgram === 'black-crown' ? 'Black Crown' : 'Crownforge'
  const day = getProgramDay(homeProgram, today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)
  const title = day?.title ?? (homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : homeProgram === 'black-crown' ? 'BLACK CROWN' : 'CROWNFORGE')
  const sub = day ? `${homeProgramName} • Week ${today?.week ?? state.selectedWeek} • Day ${today?.day ?? state.selectedDay}` : 'Your current training block'
  const completed = state.workout ? completionStats(state.workout) : { done: 0, total: 0, percent: 0 }
  const focus = (day?.sections ?? []).slice(0, 4).map((section, index) => `<div class="focus-chip"><span>${['01','02','03','04'][index] ?? '•'}</span>${esc(section.title)}</div>`).join('')
'''

old, new = (modular, legacy_expected) if mode == 'pre' else (command_v2_result, program_aware_result)
count = text.count(old)
if count != 1:
    raise SystemExit(f'Command V2/program compatibility {mode} expected exactly one source block, found {count}')
text = text.replace(old, new, 1)

# ProgramDay.date is optional so Black Crown can remain calendar-neutral in the
# public package. Calendar entries remain dated for Crownforge/Maintenance, but
# the renderer must satisfy the generic ProgramDay type after UI overlays.
if mode == 'post':
    old_date = '<span>${esc(day.date)}</span>'
    new_date = "<span>${day.date ? esc(day.date) : 'Program'}</span>"
    count = text.count(old_date)
    if count != 1:
        raise SystemExit(f'Command V2 optional-date compatibility expected one calendar marker, found {count}')
    text = text.replace(old_date, new_date, 1)

p.write_text(text)
PY

if [[ "$MODE" == "pre" ]]; then
  grep -Fq "const day = getCrownforgeDay(today?.week ?? state.selectedWeek" "$TARGET_DIR/src/main.ts"
  ! grep -Fq "const homeProgram = today?.program ?? state.selectedProgram" "$TARGET_DIR/src/main.ts"
  echo "Command V2 modular-program pre-compatibility: PASS"
else
  grep -Fq "const homeProgram = today?.program ?? state.selectedProgram" "$TARGET_DIR/src/main.ts"
  grep -Fq "homeProgram === 'black-crown' ? 'Black Crown'" "$TARGET_DIR/src/main.ts"
  grep -Fq "const day = getProgramDay(homeProgram" "$TARGET_DIR/src/main.ts"
  grep -Fq "day.date ? esc(day.date) : 'Program'" "$TARGET_DIR/src/main.ts"

  # The post-compat result introduces Black Crown-aware labels. Widen the UI's
  # selected-program type and routing immediately, before the first TypeScript
  # release gate. Black Crown remains undated public source; calendar mapping
  # stays limited to dated Crownforge/Maintenance records.
  bash "$SCRIPT_DIR/apply-black-crown-command-v2-core.sh" "$TARGET_DIR"
  grep -Fq "selectedProgram: PublicProgramKey" "$TARGET_DIR/src/main.ts"
  grep -Fq "program === 'black-crown' ? getBlackCrownDay" "$TARGET_DIR/src/main.ts"
  echo "Command V2 modular-program post-compatibility: PASS"
fi
