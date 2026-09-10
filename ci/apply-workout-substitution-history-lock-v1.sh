#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
SERVICE="$TARGET/src/services/workout-service.ts"
test -s "$MAIN"
test -s "$SERVICE"

MAIN="$MAIN" SERVICE="$SERVICE" python3 - <<'PY'
from pathlib import Path
import os

main_path = Path(os.environ['MAIN'])
service_path = Path(os.environ['SERVICE'])
main = main_path.read_text()
service = service_path.read_text()

# A completed flag can be reopened for correction, so it is not enough to prove
# whether substitute performance ever happened. Stamp the first native logSet
# write and retain that provenance even if the set is later reopened.
if 'substitutionPerformanceLoggedAt' not in service:
    start = service.find('export async function logSet(')
    end = service.find('\nexport async function ', start + 10)
    if start < 0 or end < 0:
        raise SystemExit('Issue #54 logSet history-lock function boundary missing')
    block = service[start:end]
    needle = "  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')"
    if needle not in block:
        raise SystemExit('Issue #54 logSet device marker missing')
    stamp = """  const completedAt = new Date().toISOString()\n  const substitutionPerformance = (existing.performance_data ?? {}) as Record<string, any>\n  if (substitutionPerformance.substitutionPerformedExerciseKey) {\n    existing.performance_data = { ...substitutionPerformance, substitutionPerformanceLoggedAt: completedAt }\n  }\n  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')"""
    block = block.replace(needle, stamp, 1)
    block = block.replace('completed_at: new Date().toISOString(),', 'completed_at: completedAt,', 1)
    service = service[:start] + block + service[end:]

# Both change-substitute and revert must fail closed after substitute work was
# logged, even if the athlete later reopens that set for correction.
old_guard = "activeSets.some((set) => Boolean(set.completed))"
new_guard = "activeSets.some((set) => Boolean(set.completed) || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt))"
if old_guard in service:
    service = service.replace(old_guard, new_guard)
if service.count('substitutionPerformanceLoggedAt') < 3:
    raise SystemExit('Issue #54 history-lock service guards were not installed')

# The card follows the same immutable-history rule on reload/render.
old_main = "const hasCompletedSubstituteSets = substituted && sets.some((set) => Boolean(set.completed))"
new_main = "const hasCompletedSubstituteSets = substituted && sets.some((set) => Boolean(set.completed) || Boolean(((set.performance_data ?? {}) as Record<string, any>).substitutionPerformanceLoggedAt))"
if old_main in main:
    main = main.replace(old_main, new_main, 1)
elif 'substitutionPerformanceLoggedAt' not in main:
    raise SystemExit('Issue #54 history-lock card guard missing')

main_path.write_text(main)
service_path.write_text(service)
PY

grep -Fq 'substitutionPerformanceLoggedAt: completedAt' "$SERVICE"
grep -Fq 'substitutionPerformanceLoggedAt' "$MAIN"
grep -Fq 'Completed substitute work cannot be relabeled' "$SERVICE"

echo "Issue #54 logged substitute history lock: PASS"
