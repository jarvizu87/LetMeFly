#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?reconstructed app root required}"
MAIN="$TARGET/src/main.ts"
FLOW="$TARGET/public/ui/workout-flow-v1.js"

for file in "$MAIN" "$FLOW"; do
  test -s "$file" || { echo "Missing athlete-unit runtime target: $file" >&2; exit 1; }
done

MAIN="$MAIN" FLOW="$FLOW" python3 - <<'PY'
from pathlib import Path
import os
import re

main_path = Path(os.environ['MAIN'])
flow_path = Path(os.environ['FLOW'])
main = main_path.read_text()
flow = flow_path.read_text()

# athletePreferences owns weight_unit. Hydrate that preference into the in-memory
# athlete view before the first governed render instead of treating the base
# athletes row as though it owned the unit.
old_preference_row = """  const row = rows.filter(r => !r.deleted_at && r.athlete_id === athlete?.id).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null
  const signature = JSON.stringify([athlete?.id ?? null, row])
"""
new_preference_row = """  const row = rows.filter(r => !r.deleted_at && r.athlete_id === athlete?.id).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null
  const preferredWeightUnit = row?.weight_unit === 'kg' ? 'kg' : row?.weight_unit === 'lb' ? 'lb' : null
  if (preferredWeightUnit && athlete && state.athlete && state.athlete.id === athlete.id) {
    const currentAthlete: LocalDomainRecord = state.athlete
    state.athlete = { ...currentAthlete, weight_unit: preferredWeightUnit }
  }
  const signature = JSON.stringify([athlete?.id ?? null, row])
"""
if main.count(old_preference_row) != 1:
    raise SystemExit(f'Expected one athlete preference hydration boundary, found {main.count(old_preference_row)}')
main = main.replace(old_preference_row, new_preference_row, 1)

old_boot = """    if (state.athlete) {
      try {
        const recovered = await recoverPendingWorkoutProgression(state.athlete.id)
"""
new_boot = """    if (state.athlete) {
      await refreshBarbellSettings().catch(() => undefined)
      try {
        const recovered = await recoverPendingWorkoutProgression(state.athlete.id)
"""
if main.count(old_boot) != 1:
    raise SystemExit(f'Expected one boot athlete boundary, found {main.count(old_boot)}')
main = main.replace(old_boot, new_boot, 1)

# A brand-new athlete must get the same preference hydration before the first
# post-onboarding render. Match the create call rather than depending on local
# variable names inside the onboarding handler.
onboard_pattern = re.compile(r"(state\.athlete\s*=\s*await\s+createLocalAthlete\([^\n]+\)\n)(\s*state\.programInstance\s*=\s*await\s+getCurrentProgramInstance\(state\.athlete\.id\))")
onboard_matches = list(onboard_pattern.finditer(main))
if len(onboard_matches) != 1:
    raise SystemExit(f'Expected one onboarding athlete boundary, found {len(onboard_matches)}')
main = onboard_pattern.sub(r"\1  await refreshBarbellSettings().catch(() => undefined)\n\2", main, count=1)

old_load = """  const load = set.load_value ?? ''
  const rpe = set.rpe ?? ''
  const plate = typeof load === 'number' && set.load_unit === 'lb' ? formatPlates(calculatePlates(load)) : ''
"""
new_load = """  const storedLoad = set.load_value ?? ''
  const storedUnit = set.load_unit === 'kg' ? 'kg' : set.load_unit === 'lb' ? 'lb' : null
  const athleteUnit = state.athlete?.weight_unit === 'kg' ? 'kg' : 'lb'
  const load = typeof storedLoad === 'number' && storedUnit && storedUnit !== athleteUnit
    ? Math.round((storedUnit === 'lb' ? storedLoad * 0.45359237 : storedLoad / 0.45359237) * 10) / 10
    : storedLoad
  const loadUnit = typeof load === 'number' ? athleteUnit : (storedUnit ?? athleteUnit)
  const rpe = set.rpe ?? ''
  const plate = typeof load === 'number' && loadUnit === 'lb' ? formatPlates(calculatePlates(load)) : ''
"""
if main.count(old_load) != 1:
    raise SystemExit(f'Expected one workout load display boundary, found {main.count(old_load)}')
main = main.replace(old_load, new_load, 1)

old_attr = 'data-metric-unit="${esc(metric.unit)}" data-programmed-load="${esc(loadSignature)}"'
new_attr = 'data-metric-unit="${esc(metric.unit)}" data-load-unit="${esc(loadUnit)}" data-programmed-load="${esc(loadSignature)}"'
if main.count(old_attr) != 1:
    raise SystemExit(f'Expected one workout set unit attribute boundary, found {main.count(old_attr)}')
main = main.replace(old_attr, new_attr, 1)

old_small = '<small>${esc(plate)}</small>'
new_small = "<small>${esc(plate || (typeof load === 'number' ? loadUnit : ''))}</small>"
if main.count(old_small) != 1:
    raise SystemExit(f'Expected one workout load helper boundary, found {main.count(old_small)}')
main = main.replace(old_small, new_small, 1)

old_log_unit = "      loadUnit: loadRaw === '' ? null : 'lb',"
new_log_unit = "      loadUnit: loadRaw === '' ? null : (row.dataset.loadUnit === 'kg' ? 'kg' : 'lb'),"
if main.count(old_log_unit) != 1:
    raise SystemExit(f'Expected one native set load-unit write boundary, found {main.count(old_log_unit)}')
main = main.replace(old_log_unit, new_log_unit, 1)

old_barbell = "    return resolveBarbellSettings(defaults, saved, state.athlete?.id === barbellPreferenceAthlete ? barbellPreference : null)"
new_barbell = """    const resolved = resolveBarbellSettings(defaults, saved, state.athlete?.id === barbellPreferenceAthlete ? barbellPreference : null)
    const savedUnit = saved && typeof saved === 'object' ? (saved as Record<string, unknown>).unit : null
    const athleteUnit = state.athlete?.weight_unit
    if (savedUnit !== 'kg' && savedUnit !== 'lb' && (athleteUnit === 'kg' || athleteUnit === 'lb')) resolved.unit = athleteUnit
    return resolved"""
if main.count(old_barbell) != 1:
    raise SystemExit(f'Expected one Bar Loader settings bridge boundary, found {main.count(old_barbell)}')
main = main.replace(old_barbell, new_barbell, 1)

old_flow = '    if (load) pieces.push(`${load} lb`)'
new_flow = "    if (load) pieces.push(`${load} ${row?.dataset?.loadUnit === 'kg' ? 'kg' : 'lb'}`)"
if flow.count(old_flow) != 1:
    raise SystemExit(f'Expected one workout flow load-unit presentation boundary, found {flow.count(old_flow)}')
flow = flow.replace(old_flow, new_flow, 1)

main_path.write_text(main)
flow_path.write_text(flow)
PY

grep -Fq "const preferredWeightUnit = row?.weight_unit === 'kg'" "$MAIN"
grep -Fq "await refreshBarbellSettings().catch(() => undefined)" "$MAIN"
grep -Fq "const storedUnit = set.load_unit === 'kg'" "$MAIN"
grep -Fq 'data-load-unit="${esc(loadUnit)}"' "$MAIN"
grep -Fq "row.dataset.loadUnit === 'kg' ? 'kg' : 'lb'" "$MAIN"
grep -Fq "const savedUnit = saved && typeof saved === 'object'" "$MAIN"
grep -Fq 'dataset?.loadUnit' "$FLOW"

echo "LetMeFly athlete weight-unit preference hydration + runtime conversion + Bar Loader default: PASS"
