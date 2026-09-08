#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
SUPPLEMENT="$ROOT_DIR/overlays/exercise-intelligence/black-crown-v2-1-supplement.json"
RUNTIME="$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"

[[ -f "$DATA" ]]
[[ -f "$SUPPLEMENT" ]]
[[ -f "$RUNTIME" ]]

python - "$DATA" "$SUPPLEMENT" <<'PY'
from __future__ import annotations
import json
import sys
from pathlib import Path

data_path = Path(sys.argv[1])
supp_path = Path(sys.argv[2])
data = json.loads(data_path.read_text())
supp = json.loads(supp_path.read_text())

base = supp['baseCounts']
final = supp['finalCounts']
if data.get('counts', {}).get('exercises') != base['exercises']:
    raise SystemExit(f"Exercise Intelligence base exercise count mismatch: {data.get('counts')}")
if data.get('counts', {}).get('substitutionRules') != base['substitutionRules']:
    raise SystemExit(f"Exercise Intelligence base substitution count mismatch: {data.get('counts')}")

exercise_ids = {item['id'] for item in data.get('exercises', [])}
for exercise in supp['exercises']:
    if exercise['id'] in exercise_ids:
        raise SystemExit(f"supplement exercise already exists: {exercise['id']}")
    data['exercises'].append(exercise)
    exercise_ids.add(exercise['id'])

rule_ids = {item.get('id') or item.get('ruleId') for item in data.get('substitutionRules', [])}
for rule in supp['substitutionRules']:
    if rule['id'] in rule_ids:
        raise SystemExit(f"supplement substitution rule already exists: {rule['id']}")
    if rule['primaryExerciseId'] not in exercise_ids:
        raise SystemExit(f"supplement primary exercise missing: {rule['primaryExerciseId']}")
    if rule['alternativeExerciseId'] not in exercise_ids:
        raise SystemExit(f"supplement alternative exercise missing: {rule['alternativeExerciseId']}")
    data['substitutionRules'].append(rule)
    rule_ids.add(rule['id'])

data['counts']['exercises'] = len(data['exercises'])
data['counts']['substitutionRules'] = len(data['substitutionRules'])
data['schemaVersion'] = '1.1-black-crown-v2-1'
data['bookInformedSupplements'] = ['black-crown-v2-1-lateral-glute']

if data['counts']['exercises'] != final['exercises'] or data['counts']['substitutionRules'] != final['substitutionRules']:
    raise SystemExit(f"final Exercise Intelligence counts mismatch: {data['counts']}")
if len({item['id'] for item in data['exercises']}) != final['exercises']:
    raise SystemExit('duplicate Exercise Intelligence exercise IDs after supplement')
if any('driveFileId' in (item.get('thumbnail') or {}) or 'driveUrl' in (item.get('thumbnail') or {}) for item in data['exercises']):
    raise SystemExit('private thumbnail provenance leaked after supplement')

for required in ('machine-hip-abduction', 'seated-band-hip-abduction', 'mini-band-lateral-walk'):
    if required not in {item['id'] for item in data['exercises']}:
        raise SystemExit(f'missing required lateral-hip exercise: {required}')

machine_rules = [r for r in data['substitutionRules'] if r.get('primaryExerciseId') == 'machine-hip-abduction']
if {r.get('alternativeExerciseId') for r in machine_rules} != {'seated-band-hip-abduction', 'mini-band-lateral-walk'}:
    raise SystemExit('Machine Hip Abduction fallback hierarchy mismatch')

# Keep private athlete/program state out of the public descriptive payload.
serialized = json.dumps(data, ensure_ascii=False)
for forbidden in ('drive.google.com', 'driveFileId', 'driveUrl', 'service_role', 'DATABASE_PASSWORD'):
    if forbidden in serialized:
        raise SystemExit(f'forbidden public Exercise Intelligence value: {forbidden}')

data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
PY

grep -Fq 'machine-hip-abduction' "$DATA"
grep -Fq 'seated-band-hip-abduction' "$DATA"
grep -Fq 'mini-band-lateral-walk' "$DATA"
grep -Fq '"exercises": 94' "$DATA"
grep -Fq '"substitutionRules": 27' "$DATA"
grep -Fq '1.1-black-crown-v2-1' "$DATA"
grep -Fq '94/27' "$RUNTIME"
! grep -Fq 'drive.google.com' "$DATA"
! grep -Fq 'driveFileId' "$DATA"
! grep -Fq 'driveUrl' "$DATA"

echo "Exercise Intelligence Black Crown v2.1 supplement: PASS (94 exercises / 27 substitution rules)"
