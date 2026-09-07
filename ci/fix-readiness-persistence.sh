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

if 'readinessDraft:' in text or 'hydrateReadinessDraft' in text:
    raise SystemExit('readiness persistence patch appears to be applied already')

# Keep the saved readiness in application state so a normal render does not
# visually clear the athlete's choices.
state_start = text.find('const state = {')
if state_start < 0:
    raise SystemExit('could not locate LetMeFly state object')
state_end = text.find('\n}', state_start)
if state_end < 0:
    raise SystemExit('could not locate end of LetMeFly state object')
last_non_ws = state_end - 1
while last_non_ws > state_start and text[last_non_ws].isspace():
    last_non_ws -= 1
separator = '' if text[last_non_ws] == ',' else ','
field = separator + '''\n  readinessDraft: null as null | {
    sleepQuality: number
    energy: number
    soreness: number
    stress: number
    notes: string | null
  },'''
text = text[:state_end] + field + text[state_end:]

# Rehydrate only the selected day's latest saved readiness. This prevents
# yesterday's score from being presented as today's readiness while still
# surviving route renders, refreshes, and PWA relaunches.
readiness_start = text.find('function readinessPage(day: ProgramDay, hasWorkout: boolean): string {')
program_card_start = text.find('function programExerciseCard(', readiness_start)
if readiness_start < 0 or program_card_start < 0:
    raise SystemExit('could not locate readinessPage/programExerciseCard boundary')

replacement = '''async function hydrateReadinessDraft(): Promise<void> {
  state.readinessDraft = null
  if (!state.athlete) return
  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  if (!day) return
  const rows = (await getAll<LocalDomainRecord>('readinessEntries'))
    .filter((row) => row.athlete_id === state.athlete?.id && !row.deleted_at)
    .filter((row) => String(row.recorded_at ?? '').slice(0, 10) === day.date)
    .sort((a, b) => Date.parse(String(b.recorded_at ?? '')) - Date.parse(String(a.recorded_at ?? '')))
  const row = rows[0]
  if (!row) return
  const sleepQuality = Number(row.sleep_quality ?? 0)
  const energy = Number(row.energy ?? 0)
  const soreness = Number(row.soreness ?? 0)
  const stress = Number(row.stress ?? 0)
  const valid = [sleepQuality, energy, soreness, stress].every((value) => Number.isFinite(value) && value >= 1 && value <= 5)
  if (!valid) return
  state.readinessDraft = {
    sleepQuality,
    energy,
    soreness,
    stress,
    notes: row.notes == null ? null : String(row.notes),
  }
}

function readinessPage(day: ProgramDay, hasWorkout: boolean): string {
  const draft = state.readinessDraft
  const scale = (name: string, hint: string, selected: number | null) => `<div class="readiness-field"><div class="readiness-label"><strong>${esc(name)}</strong><span>${esc(hint)}</span></div><div class="readiness-options">${[1,2,3,4,5].map((v) => `<label><input type="radio" name="readiness-${slug(name)}" value="${v}" ${selected === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>`
  return `<section class="swipe-page workout-panel readiness-panel"><div class="readiness-graphic"><span>01</span><b>READINESS</b></div><div class="page-kicker">Front of every training day</div><h2>How are you showing up?</h2><p class="muted">This controls allowed auto-regulation. It does not rewrite Crownforge.</p><div class="readiness-stack">${scale('Sleep quality', '1 low • 5 high', draft?.sleepQuality ?? null)}${scale('Energy', '1 low • 5 high', draft?.energy ?? null)}${scale('Soreness', '1 low • 5 high', draft?.soreness ?? null)}${scale('Stress', '1 low • 5 high', draft?.stress ?? null)}<div class="field"><label>Coach notes</label><textarea id="readiness-notes" class="input" rows="3" placeholder="Anything the coach should know?">${esc(draft?.notes ?? '')}</textarea></div></div><div class="btn-row">${hasWorkout ? `<button class="btn purple" data-action="save-readiness">UPDATE READINESS</button>` : `<button class="btn primary" data-action="start-workout">${day.restDay ? 'SAVE READINESS & LOG REST DAY' : 'SAVE READINESS & START WORKOUT'}</button>`}</div></section>`
}
'''
text = text[:readiness_start] + replacement + text[program_card_start:]

# A complete form becomes the in-memory draft immediately. Therefore any
# render caused by the save toast or workout start keeps the selected buttons.
input_start = text.find('function readinessInputFromForm():')
save_start = text.find('async function saveReadinessFromForm(): Promise<void> {', input_start)
if input_start < 0 or save_start < 0:
    raise SystemExit('could not locate readinessInputFromForm/saveReadinessFromForm boundary')
new_input = '''function readinessInputFromForm(): { sleepQuality: number; energy: number; soreness: number; stress: number; notes: string | null } | null {
  const get = (label: string): number | null => {
    const value = document.querySelector<HTMLInputElement>(`input[name="readiness-${slug(label)}"]:checked`)?.value
    return value ? Number(value) : null
  }
  const sleepQuality = get('Sleep quality')
  const energy = get('Energy')
  const soreness = get('Soreness')
  const stress = get('Stress')
  if ([sleepQuality, energy, soreness, stress].some((value) => value === null)) return null
  const input = {
    sleepQuality: sleepQuality!,
    energy: energy!,
    soreness: soreness!,
    stress: stress!,
    notes: document.querySelector<HTMLTextAreaElement>('#readiness-notes')?.value ?? null,
  }
  state.readinessDraft = input
  return input
}

'''
text = text[:input_start] + new_input + text[save_start:]

# refreshWorkout is the canonical local hydration path used at startup, day
# changes, and set updates. Add readiness hydration there so reload/reopen works.
refresh_start = text.find('async function refreshWorkout(): Promise<void> {')
render_start = text.find('\nfunction render(): void {', refresh_start)
if refresh_start < 0 or render_start < 0:
    raise SystemExit('could not locate refreshWorkout/render boundary')
refresh_fn = text[refresh_start:render_start]
close = refresh_fn.rfind('}')
if close < 0:
    raise SystemExit('could not locate refreshWorkout closing brace')
refresh_fn = refresh_fn[:close] + '  await hydrateReadinessDraft()\n' + refresh_fn[close:]
text = text[:refresh_start] + refresh_fn + text[render_start:]

p.write_text(text)
PY

grep -Fq 'readinessDraft:' "$TARGET_DIR/src/main.ts"
grep -Fq 'async function hydrateReadinessDraft()' "$TARGET_DIR/src/main.ts"
grep -Fq "selected === v ? 'checked' : ''" "$TARGET_DIR/src/main.ts"
grep -Fq "String(row.recorded_at ?? '').slice(0, 10) === day.date" "$TARGET_DIR/src/main.ts"
grep -Fq 'state.readinessDraft = input' "$TARGET_DIR/src/main.ts"
grep -Fq 'await hydrateReadinessDraft()' "$TARGET_DIR/src/main.ts"
! grep -Fq "v === 3 ? 'checked' : ''" "$TARGET_DIR/src/main.ts"

echo "LetMeFly readiness selection persistence: PASS"
