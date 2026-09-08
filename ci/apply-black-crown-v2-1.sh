#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
MANIFEST="$ROOT_DIR/overlays/program-data/black-crown-v2-1/REVISION_MANIFEST.json"

[[ -d "$TARGET/src/programs/black-crown/source-weeks" ]]
[[ -f "$TARGET/src/programs/black-crown/weeks.ts" ]]
[[ -f "$TARGET/src/data/exercise-library.ts" ]]
[[ -f "$MANIFEST" ]]

hash_tree() {
  local path="$1"
  find "$path" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

CROWNFORGE_BEFORE="$(hash_tree "$TARGET/src/programs/crownforge")"
MAINTENANCE_BEFORE="$(hash_tree "$TARGET/src/programs/crown-maintenance")"

python - "$TARGET" "$MANIFEST" <<'PY'
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest_path = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text())
if manifest.get('version') != 'v2.1' or manifest.get('baseVersion') != 'v2.0':
    raise SystemExit('Black Crown v2.1 revision manifest mismatch')

program = root / 'src/programs/black-crown'
source_dir = program / 'source-weeks'
library = root / 'src/data/exercise-library.ts'

old_note = 'No additional loaded glute slot; weekly roles already supplied by D1 hip thrust/lunge + D3 deadlift'
new_note = 'v2.1 intentional glute-specialization amendment: no additional support slot is added; Day 5 Machine Hip Abduction replaces the redundant secondary Chest-Supported Row while D1 hip thrust/lunge + D3 deadlift retain the weekly hip-extension roles'
old_work = 'Lat Pulldown 2–3x8–10 + Chest-Supported Row 2x8–10'
new_work = 'Lat Pulldown 2–3x8–10 + Machine Hip Abduction 2x15–25 RPE7–8 — 45–60 sec rest'

affected_before = {}
affected_after = {}
for week in range(25, 30):
    path = source_dir / f'week-{week:02d}.ts'
    if not path.is_file():
        raise SystemExit(f'missing Black Crown source week {week}')
    before = path.read_text()
    affected_before[str(week)] = hashlib.sha256(before.encode()).hexdigest()
    if before.count(old_note) != 1:
        raise SystemExit(f'W{week} expected one v2.0 glute-note patch point, found {before.count(old_note)}')
    if before.count(old_work) != 1:
        raise SystemExit(f'W{week} expected one v2.0 structural-row patch point, found {before.count(old_work)}')
    after = before.replace(old_note, new_note, 1).replace(old_work, new_work, 1)
    if old_note in after or old_work in after:
        raise SystemExit(f'W{week} retained a superseded v2.0 glute/row statement')
    path.write_text(after)
    affected_after[str(week)] = hashlib.sha256(after.encode()).hexdigest()

# Week 30 is the non-max check and must remain outside the amendment.
w30 = (source_dir / 'week-30.ts').read_text()
if 'Chest-Supported Row 2x10 RPE6 + Leg Extension 2x12 easy + Trap-3 2x12 + Dead Bug 2x8/side' not in w30:
    raise SystemExit('W30 non-max check source drifted before v2.1 amendment')

# Add both lateral-hip exercise identities to the public exercise library before
# regenerating Black Crown so the normalizer resolves Machine Hip Abduction as a
# canonical exercise instead of a free-text fallback.
text = library.read_text()
insert_marker = ']\n\nconst COMPOSITE_MATCHES'
if insert_marker not in text:
    raise SystemExit('exercise-library insertion marker missing')
rows = []
if "fallback('Machine Hip Abduction'" not in text:
    rows.append("  fallback('Machine Hip Abduction', 'https://www.youtube.com/results?search_query=Machine+Hip+Abduction+exercise+tutorial', ['Black Crown']),")
if "fallback('Seated Band Hip Abduction'" not in text:
    rows.append("  fallback('Seated Band Hip Abduction', 'https://www.youtube.com/results?search_query=Seated+Band+Hip+Abduction+exercise+tutorial', ['Black Crown']),")
if rows:
    text = text.replace(insert_marker, '\n'.join(rows) + '\n]\n\nconst COMPOSITE_MATCHES', 1)
library.write_text(text)

marker = {
    'program': 'Black Crown Revised',
    'version': 'v2.1',
    'baseVersion': 'v2.0',
    'affectedWeeks': list(range(25, 30)),
    'affectedDay': 5,
    'affectedSourceHashesBefore': affected_before,
    'affectedSourceHashesAfter': affected_after,
    'replacement': {
        'removed': old_work,
        'added': new_work,
        'fallbacks': ['Seated Band Hip Abduction', 'Mini-Band Lateral Walk'],
    },
}
(root / '.black-crown-v2-1-glute-specialization.json').write_text(json.dumps(marker, indent=2) + '\n')
PY

# Re-audit the amended public source for all structural/privacy invariants, then
# regenerate engine-native runtime data from the intentionally revised source.
node "$ROOT_DIR/ci/audit-black-crown-source.mjs" "$TARGET" "$ROOT_DIR/overlays/program-data/black-crown-v2-0/BLOCK_MANIFESTS.json"
node "$ROOT_DIR/ci/audit-black-crown-privacy.mjs" "$TARGET"
node "$ROOT_DIR/ci/generate-black-crown-runtime.mjs" "$TARGET"

# The v2.0 generator intentionally remains the historical base generator. Apply
# the small v2.1 version/provenance/rest amendment after deterministic generation.
python - "$TARGET" <<'PY'
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
program = root / 'src/programs/black-crown'

weeks = program / 'weeks.ts'
text = weeks.read_text()
text = text.replace('Black Crown Revised v2.0 source weeks', 'Black Crown Revised v2.0 source weeks plus the governed v2.1 lateral-glute amendment')
text = text.replace('Black Crown v2.0 —', 'Black Crown v2.1 —')
pattern = re.compile(r'(?P<indent>\s*)videoQuery: "Machine Hip Abduction exercise tutorial"\n')
matches = list(pattern.finditer(text))
if len(matches) != 5:
    raise SystemExit(f'expected 5 Machine Hip Abduction runtime exercises, found {len(matches)}')
text = pattern.sub(lambda m: f'{m.group("indent")}videoQuery: "Machine Hip Abduction exercise tutorial",\n{m.group("indent")}rest: "45–60 sec"\n', text)
weeks.write_text(text)

metadata = program / 'metadata.ts'
text = metadata.read_text()
text = text.replace("version: 'v2.0'", "version: 'v2.1'", 1)
text = text.replace("sourceEngine: 'Black Crown Revised v2.0 / Stage-5A production source'", "sourceEngine: 'Black Crown Revised v2.0 / Stage-5A source + LetMeFly v2.1 lateral-glute amendment'", 1)
text = text.replace("description: '54-week strength, powerbuilding, athletic-development, and realization system with governed TM calibration, readiness, Olympic derivatives, kettlebells, sleds, carries, and weak-point work.'", "description: '54-week strength, powerbuilding, athletic-development, and realization system with governed TM calibration, readiness, Olympic derivatives, kettlebells, sleds, carries, weak-point work, and a v2.1 Block-5 lateral-glute specialization amendment.'", 1)
text = text.replace('// Compatibility export for older consumers. Canonical v2.0 governance uses nine six-week blocks.', '// Compatibility export for older consumers. Canonical v2.1 governance retains the same nine six-week blocks.')
metadata.write_text(text)

rules = program / 'rules.ts'
rules.write_text("""export const BLACK_CROWN_SOURCE_NOTES = [
  'Canonical runtime base: Black Crown Revised v2.0, 54 weeks / 270 sessions / nine six-week blocks, plus the intentional v2.1 Block-5 lateral-glute amendment.',
  'v2.1 Weeks 25–29 Day 5 replace the later Chest-Supported Row 2x8–10 support slot with Machine Hip Abduction 2x15–25 at RPE 7–8; no extra slot is added.',
  'Machine Hip Abduction rest is 45–60 sec. Equipment fallback order is Seated Band Hip Abduction, then Mini-Band Lateral Walk, preserving the same lateral-hip role and support-slot budget.',
  'Normal Block 1 entry is 90% of verified Crownforge 1RM, lift by lift; 87.5% is protective Yellow entry only; Red delays entry.',
  'Percentage/TM prescriptions are loading authority. Selected TMs round to the nearest 5 lb; percentage work rounds up to the nearest 5 lb.',
  'Strict OHP is a governed replacement/microdose, not an added training day; protected test/check/opener weeks remove it.',
  'Mandatory work is protected. Readiness reductions remove Optional work first, then Conditional work, and never silently rewrite the public program.',
  'Athlete calendar dates, current TMs, rendered pound loads, history, readiness, and workout results belong to private athlete data.',
] as const
""")

audit_path = root / 'BLACK_CROWN_RUNTIME_AUDIT.json'
audit = json.loads(audit_path.read_text())
audit['version'] = 'Black Crown Revised v2.1'
audit['baseVersion'] = 'Black Crown Revised v2.0'
audit['revision'] = {
    'id': 'block5-lateral-glute-replacement-v1',
    'weeks': [25, 26, 27, 28, 29],
    'day': 5,
    'exercise': 'Machine Hip Abduction',
    'sets': '2x15–25',
    'rpe': '7–8',
    'rest': '45–60 sec',
    'replaces': 'secondary Chest-Supported Row 2x8–10',
    'setNeutral': True,
}
audit_path.write_text(json.dumps(audit, indent=2) + '\n')
PY

node "$ROOT_DIR/ci/audit-black-crown-runtime.mjs" "$TARGET"
node "$ROOT_DIR/ci/audit-black-crown-v2-1.mjs" "$TARGET"

CROWNFORGE_AFTER="$(hash_tree "$TARGET/src/programs/crownforge")"
MAINTENANCE_AFTER="$(hash_tree "$TARGET/src/programs/crown-maintenance")"
[[ "$CROWNFORGE_BEFORE" == "$CROWNFORGE_AFTER" ]] || {
  echo "Black Crown v2.1 modified Crownforge; refusing build." >&2
  exit 1
}
[[ "$MAINTENANCE_BEFORE" == "$MAINTENANCE_AFTER" ]] || {
  echo "Black Crown v2.1 modified Crown Maintenance; refusing build." >&2
  exit 1
}

echo "Black Crown v2.1 glute-specialization overlay: PASS (W25-W29 D5 set-neutral lateral-glute replacement; protected programs unchanged)"
