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

main_path = Path(os.environ['MAIN'])
flow_path = Path(os.environ['FLOW'])
main = main_path.read_text()
flow = flow_path.read_text()

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

grep -Fq "const storedUnit = set.load_unit === 'kg'" "$MAIN"
grep -Fq 'data-load-unit="${esc(loadUnit)}"' "$MAIN"
grep -Fq "row.dataset.loadUnit === 'kg' ? 'kg' : 'lb'" "$MAIN"
grep -Fq "const savedUnit = saved && typeof saved === 'object'" "$MAIN"
grep -Fq 'dataset?.loadUnit' "$FLOW"

echo "LetMeFly athlete weight-unit runtime + Bar Loader default: PASS"
