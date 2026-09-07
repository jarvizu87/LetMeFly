#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/services/workout-service.ts" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET_DIR'])
service = root / 'src/services/workout-service.ts'
main = root / 'src/main.ts'

# Preserve the original hardening intent in the workout service.
s = service.read_text()
old_sig = '''  programInstanceId: string | null,
  week: number,
  day: ProgramDay,
): Promise<WorkoutBundle> {'''
new_sig = '''  programInstanceId: string | null,
  week: number,
  day: ProgramDay,
  readinessId: string,
): Promise<WorkoutBundle> {'''
if s.count(old_sig) != 1:
    raise SystemExit(f'readiness service signature expected one block, found {s.count(old_sig)}')
s = s.replace(old_sig, new_sig, 1)
old_session = '''        program_instance_id: programInstanceId,
        originating_device_id: null,'''
new_session = '''        program_instance_id: programInstanceId,
        readiness_id: readinessId,
        originating_device_id: null,'''
if s.count(old_session) != 1:
    raise SystemExit(f'readiness session link expected one block, found {s.count(old_session)}')
s = s.replace(old_session, new_session, 1)
service.write_text(s)

t = main.read_text()

# Session-review action must clearly communicate the readiness requirement.
old_review = '''<button class="btn primary hero-start" data-action="start-workout">${day.restDay ? 'LOG REST DAY' : 'START WORKOUT'}</button>'''
new_review = '''<button class="btn primary hero-start" data-action="start-workout">${day.restDay ? 'SAVE READINESS & LOG REST DAY' : 'SAVE READINESS & START WORKOUT'}</button>'''
if t.count(old_review) != 1:
    raise SystemExit(f'readiness review action expected one block, found {t.count(old_review)}')
t = t.replace(old_review, new_review, 1)

# Replace the readiness renderer as a complete function so line movement from
# modular Program/Progress UI cannot make the historical patch brittle.
start = t.find('function readinessPage(day: ProgramDay, hasWorkout: boolean): string {')
next_start = t.find('function programExerciseCard(', start)
if start < 0 or next_start < 0:
    raise SystemExit('could not locate readinessPage/programExerciseCard boundary')
new_readiness = '''function readinessPage(day: ProgramDay, hasWorkout: boolean): string {
  const scale = (name: string, hint: string) => `<div class="readiness-field"><div class="readiness-label"><strong>${esc(name)}</strong><span>${esc(hint)}</span></div><div class="readiness-options">${[1,2,3,4,5].map((v) => `<label><input type="radio" name="readiness-${slug(name)}" value="${v}"><span>${v}</span></label>`).join('')}</div></div>`
  return `<section class="swipe-page workout-panel readiness-panel"><div class="readiness-graphic"><span>01</span><b>READINESS</b></div><div class="page-kicker">Front of every training day</div><h2>How are you showing up?</h2><p class="muted">This controls allowed auto-regulation. It does not rewrite Crownforge.</p><div class="readiness-stack">${scale('Sleep quality', '1 low • 5 high')}${scale('Energy', '1 low • 5 high')}${scale('Soreness', '1 low • 5 high')}${scale('Stress', '1 low • 5 high')}<div class="field"><label>Coach notes</label><textarea id="readiness-notes" class="input" rows="3" placeholder="Anything the coach should know?"></textarea></div></div><div class="btn-row">${hasWorkout ? `<button class="btn purple" data-action="save-readiness">UPDATE READINESS</button>` : `<button class="btn primary" data-action="start-workout">${day.restDay ? 'SAVE READINESS & LOG REST DAY' : 'SAVE READINESS & START WORKOUT'}</button>`}</div></section>`
}'''
t = t[:start] + new_readiness + t[next_start:]

# Replace readiness save as a complete function.
save_start = t.find('async function saveReadinessFromForm(): Promise<void> {')
start_workout = t.find('async function startSelectedWorkout(): Promise<void> {', save_start)
if save_start < 0 or start_workout < 0:
    raise SystemExit('could not locate readiness save/start boundary')
new_save = '''function readinessInputFromForm(): { sleepQuality: number; energy: number; soreness: number; stress: number; notes: string | null } | null {
  const get = (label: string): number | null => {
    const value = document.querySelector<HTMLInputElement>(`input[name="readiness-${slug(label)}"]:checked`)?.value
    return value ? Number(value) : null
  }
  const sleepQuality = get('Sleep quality')
  const energy = get('Energy')
  const soreness = get('Soreness')
  const stress = get('Stress')
  if ([sleepQuality, energy, soreness, stress].some((value) => value === null)) return null
  return {
    sleepQuality: sleepQuality!,
    energy: energy!,
    soreness: soreness!,
    stress: stress!,
    notes: document.querySelector<HTMLTextAreaElement>('#readiness-notes')?.value ?? null,
  }
}

async function saveReadinessFromForm(): Promise<void> {
  if (!state.athlete) return
  const input = readinessInputFromForm()
  if (!input) return showToast('Rate sleep, energy, soreness, and stress first')
  await saveReadiness(state.athlete.id, input)
  const color = readinessColor(input)
  state.cloud.syncSoon()
  showToast(`Readiness updated • ${color.toUpperCase()}`)
}

'''
t = t[:save_start] + new_save + t[start_workout:]

# Modify startSelectedWorkout in place rather than replacing its program lookup.
fn_start = t.find('async function startSelectedWorkout(): Promise<void> {')
next_async = t.find('\nasync function ', fn_start + 1)
if fn_start < 0 or next_async < 0:
    raise SystemExit('could not isolate startSelectedWorkout')
fn = t[fn_start:next_async]
anchor = '  if (!day) return\n'
if fn.count(anchor) != 1:
    raise SystemExit(f'startSelectedWorkout day guard expected one anchor, found {fn.count(anchor)}')
readiness_gate = '''  if (!day) return
  const input = readinessInputFromForm()
  if (!input) {
    document.querySelector<HTMLButtonElement>('[data-session-index="0"]')?.click()
    return showToast('Complete readiness before starting')
  }
  const readiness = await saveReadiness(state.athlete.id, input)
'''
fn = fn.replace(anchor, readiness_gate, 1)

call_marker = 'state.workout = await startWorkout('
call_pos = fn.find(call_marker)
if call_pos < 0 or fn.count(call_marker) != 1:
    raise SystemExit('startSelectedWorkout expected exactly one startWorkout call')
open_pos = fn.find('(', call_pos)
depth = 0
close_pos = None
for i in range(open_pos, len(fn)):
    ch = fn[i]
    if ch == '(':
        depth += 1
    elif ch == ')':
        depth -= 1
        if depth == 0:
            close_pos = i
            break
if close_pos is None:
    raise SystemExit('could not parse startWorkout call')
args = fn[open_pos + 1:close_pos].rstrip()
if args.rstrip().endswith(','):
    new_args = args + '\n    readiness.id,'
else:
    # Preserve existing compact or multiline arguments and append the readiness link.
    if '\n' in args:
        new_args = args + ',\n    readiness.id,'
    else:
        new_args = args + ', readiness.id'
fn = fn[:open_pos + 1] + new_args + fn[close_pos:]

old_toast = "  showToast('Workout saved locally • cloud sync pending if needed')"
if fn.count(old_toast) != 1:
    raise SystemExit(f'startSelectedWorkout completion toast expected one block, found {fn.count(old_toast)}')
fn = fn.replace(old_toast, "  showToast(`Readiness ${readinessColor(input).toUpperCase()} • workout saved locally`)", 1)
t = t[:fn_start] + fn + t[next_async:]

main.write_text(t)
PY

grep -Fq 'readinessId: string' "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq 'readiness_id: readinessId' "$TARGET_DIR/src/services/workout-service.ts"
grep -Fq 'const readiness = await saveReadiness(state.athlete.id, input)' "$TARGET_DIR/src/main.ts"
grep -Fq 'readiness.id' "$TARGET_DIR/src/main.ts"
grep -Fq 'SAVE READINESS & START WORKOUT' "$TARGET_DIR/src/main.ts"
grep -Fq 'Complete readiness before starting' "$TARGET_DIR/src/main.ts"
grep -Fq 'UPDATE READINESS' "$TARGET_DIR/src/main.ts"
! grep -Fq "v === 3 ? 'checked' : ''" "$TARGET_DIR/src/main.ts"

echo "Command V2 modular workout-readiness hardening: PASS"
