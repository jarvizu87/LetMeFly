#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
SUPPLEMENT="$ROOT_DIR/overlays/exercise-intelligence/active-program-coverage-supplement-v1.json"
RUNTIME="$DIST_DIR/ui/exercise-intelligence-runtime-v1.js"

for required in "$DATA" "$SUPPLEMENT" "$RUNTIME"; do
  test -s "$required"
done

python - "$DATA" "$SUPPLEMENT" <<'PY'
from __future__ import annotations
import json
import sys
from pathlib import Path

data_path = Path(sys.argv[1])
supp_path = Path(sys.argv[2])
data = json.loads(data_path.read_text())
supp = json.loads(supp_path.read_text())

if data.get('schemaVersion') != supp.get('baseSchemaVersion'):
    raise SystemExit(f"Active-program coverage base schema mismatch: {data.get('schemaVersion')} != {supp.get('baseSchemaVersion')}")

base = supp['baseCounts']
final = supp['finalCounts']
counts = data.get('counts', {})
if counts.get('exercises') != base['exercises'] or counts.get('substitutionRules') != base['substitutionRules']:
    raise SystemExit(f"Active-program coverage base count mismatch: {counts}")

if supp.get('substitutionRules') != []:
    raise SystemExit('Active-program coverage supplement may not add substitution rules')

expected_ids = {
    '90-90-hip-mobility',
    'box-jump',
    'box-squat',
    'broad-jump',
    'explosive-push-up',
    'finger-extension',
    'hip-airplane',
    'kb-dead-stop-swing',
    'medicine-ball-chest-pass',
    'rack-pull',
    'reverse-lunge',
    'snatch-grip-rdl',
    'sorenson-hold',
    'trap-3-raise',
}
incoming_ids = {item.get('id') for item in supp.get('exercises', [])}
if incoming_ids != expected_ids or len(supp.get('exercises', [])) != 14:
    raise SystemExit(f"Active-program coverage identity set mismatch: {sorted(incoming_ids)}")

expected_compounds = [
    'Bike / Incline Walk',
    'Bike / Row / Walk',
    'Bike / Walk',
    'Bike or Walk',
    'Walk or Bike',
    'Dead Bug or Hollow Hold',
    'Front Squat + Bench Ramp Sets',
    'KB Lateral Clean or Outside Swing to Rack',
    'Pull-Up or Lat Pulldown',
    'Reverse Crunch or Dead Bug',
    'Wide or Neutral Pulldown',
    'Curl',
    'Pushdown',
]
if supp.get('compoundProgramDisplayNames') != expected_compounds:
    raise SystemExit('Active-program compound display-name governance mismatch')

existing_ids = {item['id'] for item in data.get('exercises', [])}
def norm(value):
    import re
    return re.sub(r'[^a-z0-9]+', '-', str(value or '').lower().replace("'", '').replace('’', '')).strip('-')

identity_map = {}
for exercise in data.get('exercises', []):
    for value in [exercise.get('canonicalName'), *(exercise.get('aliases') or [])]:
        key = norm(value)
        if key:
            identity_map[key] = exercise['id']

for exercise in supp['exercises']:
    if exercise['id'] in existing_ids:
        raise SystemExit(f"Active-program exercise already exists: {exercise['id']}")
    for required in (
        'canonicalName', 'sourcePrograms', 'movementRoles', 'trainingCategory', 'equipment',
        'purpose', 'primaryMuscles', 'secondaryMuscles', 'coachingCues', 'commonMistakes',
        'reviewStatus', 'demo', 'evidenceClassification', 'evidenceBasis'
    ):
        if required not in exercise:
            raise SystemExit(f"Active-program exercise missing {required}: {exercise['id']}")
    if exercise['reviewStatus'] != 'READY FOR REVIEW':
        raise SystemExit(f"Active-program exercise not review-ready: {exercise['id']}")
    if not exercise['movementRoles'] or not exercise['purpose'] or not exercise['coachingCues'] or not exercise['commonMistakes']:
        raise SystemExit(f"Active-program exercise lacks governed coaching coverage: {exercise['id']}")
    if exercise.get('demo', {}).get('candidateRequiresValidation') is not False:
        raise SystemExit(f"Active-program demo validation flag mismatch: {exercise['id']}")
    if not str(exercise.get('demo', {}).get('currentUrl', '')).startswith('https://www.youtube.com/results?search_query='):
        raise SystemExit(f"Active-program exercise must use a safe search fallback until direct media is validated: {exercise['id']}")
    for value in [exercise['canonicalName'], *(exercise.get('aliases') or [])]:
        key = norm(value)
        if key in identity_map:
            raise SystemExit(f"Active-program identity collides with existing exercise: {value} -> {identity_map[key]}")
        identity_map[key] = exercise['id']
    data['exercises'].append(exercise)
    existing_ids.add(exercise['id'])

data['counts']['exercises'] = len(data['exercises'])
data['counts']['substitutionRules'] = len(data['substitutionRules'])
data['counts']['roleCoverage'] = sum(bool(item.get('movementRoles')) for item in data['exercises'])
data['counts']['coachingCoverage'] = sum(
    bool(item.get('purpose')) and bool(item.get('coachingCues')) and bool(item.get('commonMistakes'))
    for item in data['exercises']
)
data['counts']['readyForReview'] = sum(item.get('reviewStatus') == 'READY FOR REVIEW' for item in data['exercises'])
data['schemaVersion'] = supp['finalSchemaVersion']
data['activeProgramCoverageSupplements'] = list(supp['activeProgramCoverageSupplements'])
data['compoundProgramDisplayNames'] = list(supp['compoundProgramDisplayNames'])

expected_counts = {
    'exercises': final['exercises'],
    'substitutionRules': final['substitutionRules'],
    'roleCoverage': final['exercises'],
    'coachingCoverage': final['exercises'],
    'readyForReview': final['exercises'],
}
for key, expected in expected_counts.items():
    if data['counts'].get(key) != expected:
        raise SystemExit(f"Active-program coverage final count mismatch {key}: {data['counts'].get(key)} != {expected}")

if len({item['id'] for item in data['exercises']}) != final['exercises']:
    raise SystemExit('Duplicate Exercise Intelligence exercise IDs after active-program supplement')

# Black Crown v2.1 supplement must survive unchanged.
if data.get('bookInformedSupplements') != ['black-crown-v2-1-lateral-glute']:
    raise SystemExit(f"Black Crown v2.1 supplement marker changed: {data.get('bookInformedSupplements')}")
machine_rules = [
    rule.get('alternativeExerciseId')
    for rule in data['substitutionRules']
    if rule.get('primaryExerciseId') == 'machine-hip-abduction'
]
if sorted(machine_rules) != sorted(['seated-band-hip-abduction', 'mini-band-lateral-walk']):
    raise SystemExit('Machine Hip Abduction fallback hierarchy changed during active-program coverage install')

serialized = json.dumps(data, ensure_ascii=False)
for forbidden in ('drive.google.com', 'driveFileId', 'driveUrl', 'service_role', 'DATABASE_PASSWORD'):
    if forbidden in serialized:
        raise SystemExit(f'forbidden public Exercise Intelligence value after active-program coverage: {forbidden}')

data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
PY

grep -Fq '"exercises": 108' "$DATA"
grep -Fq '"substitutionRules": 27' "$DATA"
grep -Fq '"roleCoverage": 108' "$DATA"
grep -Fq '"coachingCoverage": 108' "$DATA"
grep -Fq '"readyForReview": 108' "$DATA"
grep -Fq '"schemaVersion": "1.2-active-program-coverage"' "$DATA"
grep -Fq '"active-program-coverage-v1"' "$DATA"
grep -Fq '"Rack Pull"' "$DATA"
grep -Fq '"Trap-3 Raise"' "$DATA"
! grep -Fq 'drive.google.com' "$DATA"
! grep -Fq 'driveFileId' "$DATA"
! grep -Fq 'driveUrl' "$DATA"

echo "Exercise Intelligence active-program coverage supplement: PASS (108 exercises / 27 substitution rules / 108 full coverage)"
