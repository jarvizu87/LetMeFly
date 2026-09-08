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
for key, expected in base.items():
    actual = data.get('counts', {}).get(key)
    if actual != expected:
        raise SystemExit(f"Exercise Intelligence base {key} mismatch: {actual} != {expected}")

exercise_ids = {item['id'] for item in data.get('exercises', [])}
base_schema_keys = {
    'id', 'canonicalName', 'aliases', 'sourcePrograms', 'movementRoles',
    'trainingCategory', 'equipment', 'purpose', 'primaryMuscles',
    'secondaryMuscles', 'coachingCues', 'commonMistakes', 'reviewStatus',
    'demo', 'thumbnail'
}
for exercise in supp['exercises']:
    if exercise['id'] in exercise_ids:
        raise SystemExit(f"supplement exercise already exists: {exercise['id']}")
    missing = sorted(base_schema_keys - set(exercise))
    if missing:
        raise SystemExit(f"supplement exercise schema mismatch {exercise['id']}: missing {missing}")
    if 'trainingCategories' in exercise:
        raise SystemExit(f"supplement exercise uses stale trainingCategories field: {exercise['id']}")
    if exercise.get('reviewStatus') != 'READY FOR REVIEW':
        raise SystemExit(f"supplement exercise is not review-ready: {exercise['id']}")
    demo = exercise.get('demo') or {}
    if demo.get('currentStatus') != 'direct-verified':
        raise SystemExit(f"supplement exercise demo is not direct-verified: {exercise['id']}")
    if not str(demo.get('currentUrl') or '').startswith('https://www.youtube.com/watch?v='):
        raise SystemExit(f"supplement exercise demo is not a direct YouTube watch URL: {exercise['id']}")
    if demo.get('candidateRequiresValidation') is not False:
        raise SystemExit(f"supplement exercise demo still requires validation: {exercise['id']}")
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

# Recompute coverage from the merged catalog instead of carrying stale base counters.
data['counts']['exercises'] = len(data['exercises'])
data['counts']['substitutionRules'] = len(data['substitutionRules'])
data['counts']['roleCoverage'] = sum(bool(item.get('movementRoles')) for item in data['exercises'])
data['counts']['coachingCoverage'] = sum(
    bool(item.get('purpose')) and bool(item.get('coachingCues')) and bool(item.get('commonMistakes'))
    for item in data['exercises']
)
data['counts']['readyForReview'] = sum(item.get('reviewStatus') == 'READY FOR REVIEW' for item in data['exercises'])
data['schemaVersion'] = '1.1-black-crown-v2-1'
data['bookInformedSupplements'] = ['black-crown-v2-1-lateral-glute']

for key, expected in final.items():
    actual = data['counts'].get(key)
    if actual != expected:
        raise SystemExit(f"final Exercise Intelligence {key} mismatch: {actual} != {expected}")
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
grep -Fq '"roleCoverage": 94' "$DATA"
grep -Fq '"coachingCoverage": 94' "$DATA"
grep -Fq '"readyForReview": 94' "$DATA"
grep -Fq 'https://www.youtube.com/watch?v=tn-ABeb1QAM' "$DATA"
grep -Fq 'https://www.youtube.com/watch?v=BqZIR0PvxxU' "$DATA"
grep -Fq '1.1-black-crown-v2-1' "$DATA"
grep -Fq '94/27' "$RUNTIME"
! grep -Fq 'drive.google.com' "$DATA"
! grep -Fq 'driveFileId' "$DATA"
! grep -Fq 'driveUrl' "$DATA"

echo "Exercise Intelligence Black Crown v2.1 supplement: PASS (94 exercises / 27 rules / 94 full coverage)"
