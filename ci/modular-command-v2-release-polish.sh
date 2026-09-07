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

old_program = '''    <div class="program-current-week-label"><div><div class="page-kicker">Governed Crownforge detail</div><h2>VERIFIED WEEKS</h2></div><span>Tap a week to inspect it</span></div>
    <nav class="program-week-nav" aria-label="Embedded Crownforge weeks"><span>JUMP TO</span>${embeddedWeeks.map((week) => `<button class="${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    <div class="program-weeks-compact">${weekCards}</div>
    <div class="section-title"><div><div class="page-kicker">Mandatory handoff</div><h2>CROWN MAINTENANCE</h2><p class="muted">Three governed bridge weeks after testing and before Black Crown Week 1.</p></div><span class="badge mandatory">3 weeks embedded</span></div>
'''
new_program = '''    <details class="program-governed-details"><summary><span>VIEW GOVERNED CROWNFORGE WEEKS 1–14</span><small>14 governed weeks</small></summary>
      <div class="program-current-week-label"><div><div class="page-kicker">Governed Crownforge detail</div><h2>VERIFIED WEEKS</h2></div><span>Tap a week to inspect it</span></div>
      <nav class="program-week-nav" aria-label="Embedded Crownforge weeks"><span>JUMP TO</span>${embeddedWeeks.map((week) => `<button class="${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-week="${week.week}">W${week.week}</button>`).join('')}</nav>
      <div class="program-weeks-compact">${weekCards}</div>
    </details>
    <div class="section-title"><div><div class="page-kicker">Mandatory handoff</div><h2>CROWN MAINTENANCE</h2><p class="muted">Three governed bridge weeks after testing and before Black Crown Week 1.</p></div><span class="badge mandatory">3 weeks embedded</span></div>
'''

old_consistency = '''      <section class="v2-volume"><div class="v2-chart-title"><div><span>CONSISTENCY</span><strong>${workouts.length}/8</strong></div><span>Recent sessions</span></div><div class="v2-volume-grid">${Array.from({ length: 8 }, (_, index) => `<span style="height:${index < workouts.length ? 35 + ((index * 13) % 55) : 8}%"></span>`).join('')}</div></section>
'''
new_consistency = '''      <section class="v2-volume"><div class="v2-chart-title"><div><span>CONSISTENCY</span><strong>${workouts.length}/8</strong></div><span>Recent sessions</span></div><div class="v2-volume-grid">${Array.from({ length: 8 }, (_, index) => { const workout = workouts[index]; const status = String(workout?.status ?? ''); const className = !workout ? 'empty' : status === 'completed' ? 'completed' : 'active'; return `<span class="${className}" title="${workout ? esc(String(workout.workout_name ?? 'Workout')) : 'No session'}"></span>` }).join('')}</div></section>
'''

for label, old, new in [
    ('program governed weeks', old_program, new_program),
    ('progress consistency', old_consistency, new_consistency),
]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'modular release polish expected one {label} block, found {count}')
    text = text.replace(old, new, 1)

p.write_text(text)
PY

grep -Fq 'program-governed-details' "$TARGET_DIR/src/main.ts"
grep -Fq 'VIEW GOVERNED CROWNFORGE WEEKS 1–14' "$TARGET_DIR/src/main.ts"
grep -Fq '<h2>CROWN MAINTENANCE</h2>' "$TARGET_DIR/src/main.ts"
grep -Fq "status === 'completed' ? 'completed' : 'active'" "$TARGET_DIR/src/main.ts"
grep -Fq "'No session'" "$TARGET_DIR/src/main.ts"
! grep -Fq '35 + ((index * 13)' "$TARGET_DIR/src/main.ts"
! grep -Fq 'VIEW GOVERNED CROWNFORGE WEEKS 1–6' "$TARGET_DIR/src/main.ts"

echo "Command V2 modular Galaxy release polish: PASS"
