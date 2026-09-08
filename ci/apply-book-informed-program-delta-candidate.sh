#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

python - "$TARGET" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
if not root.exists():
    raise SystemExit(f'candidate target does not exist: {root}')


def tree_hash(path: Path) -> str:
    h = hashlib.sha256()
    for file in sorted(p for p in path.rglob('*') if p.is_file()):
        h.update(str(file.relative_to(path)).encode())
        h.update(b'\0')
        h.update(file.read_bytes())
        h.update(b'\0')
    return h.hexdigest()

black_crown = root / 'src/programs/black-crown'
maintenance = root / 'src/programs/crown-maintenance'
cf_root = root / 'src/programs/crownforge'
for required in (black_crown, maintenance, cf_root):
    if not required.is_dir():
        raise SystemExit(f'missing program tree: {required}')

protected_before = {
    'blackCrown': tree_hash(black_crown),
    'crownMaintenance': tree_hash(maintenance),
}

changes = {
    cf_root / 'weeks/week-01.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Primer.'),",
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'),",
    ),
    cf_root / 'weeks/week-02.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Primer.'),",
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'),",
    ),
    cf_root / 'weeks/weeks-03-06.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', repeated(2, 10, config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)), 'Primer.'),",
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', repeated(2, 10, config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)), 'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'),",
    ),
}

changed = []
for path, (needle, replacement) in changes.items():
    if not path.is_file():
        raise SystemExit(f'missing Crownforge source file: {path}')
    text = path.read_text()
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f'{path.relative_to(root)} expected one candidate patch point, found {count}')
    updated = text.replace(needle, replacement, 1)
    if updated.count("kb-swing-primer-d6") != text.count("kb-swing-primer-d6"):
        raise SystemExit(f'{path.relative_to(root)} changed primer-definition count unexpectedly')
    path.write_text(updated)
    changed.append(str(path.relative_to(root)))

protected_after = {
    'blackCrown': tree_hash(black_crown),
    'crownMaintenance': tree_hash(maintenance),
}
if protected_before != protected_after:
    raise SystemExit('book-informed candidate changed a protected Black Crown or Crown Maintenance tree')

marker = {
    'candidate': 'crownforge-day6-kb-primer-conditional-v1',
    'baseProgram': 'Crownforge v2.1',
    'changedFiles': changed,
    'protectedBefore': protected_before,
    'protectedAfter': protected_after,
    'blackCrownBookCandidate': 'REJECTED — canonical B5 W25-29 source explicitly says no additional loaded glute slot',
}
(root / '.book-informed-program-delta-candidate.json').write_text(json.dumps(marker, indent=2) + '\n')
print('Book-informed Crownforge candidate applied: Day 6 KB primer is conditional in W1-W12; Black Crown and Crown Maintenance unchanged.')
PY
