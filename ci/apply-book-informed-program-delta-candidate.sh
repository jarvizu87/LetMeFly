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


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_hashes(path: Path) -> dict[str, str]:
    return {
        str(file.relative_to(path)): sha(file)
        for file in sorted(p for p in path.rglob('*') if p.is_file())
    }


def tree_hash(path: Path) -> str:
    h = hashlib.sha256()
    for rel, digest in file_hashes(path).items():
        h.update(rel.encode())
        h.update(b'\0')
        h.update(digest.encode())
        h.update(b'\0')
    return h.hexdigest()

black_crown = root / 'src/programs/black-crown'
maintenance = root / 'src/programs/crown-maintenance'
cf_root = root / 'src/programs/crownforge'
for required in (black_crown, maintenance, cf_root):
    if not required.is_dir():
        raise SystemExit(f'missing program tree: {required}')

# The Crownforge experiment now runs against Black Crown v2.1 as the protected
# production baseline. It may not mutate Black Crown or Crown Maintenance.
black_crown_metadata = (black_crown / 'metadata.ts').read_text()
if "version: 'v2.1'" not in black_crown_metadata:
    raise SystemExit('Crownforge candidate lane requires Black Crown v2.1 protected baseline')

protected_before = {
    'blackCrown': tree_hash(black_crown),
    'crownMaintenance': tree_hash(maintenance),
}
cf_before = file_hashes(cf_root)

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
    raise SystemExit('book-informed Crownforge candidate changed protected Black Crown v2.1 or Crown Maintenance')

cf_after = file_hashes(cf_root)
if set(cf_before) != set(cf_after):
    raise SystemExit('book-informed candidate added or removed Crownforge program files')
actual_changed = sorted(
    f'src/programs/crownforge/{rel}'
    for rel in cf_before
    if cf_before[rel] != cf_after[rel]
)
expected_changed = sorted(changed)
if actual_changed != expected_changed:
    raise SystemExit(
        'book-informed candidate changed unexpected Crownforge files: '
        + json.dumps({'expected': expected_changed, 'actual': actual_changed})
    )

marker = {
    'candidate': 'crownforge-day6-kb-primer-conditional-v1',
    'baseProgram': 'Crownforge v2.1',
    'changedFiles': changed,
    'protectedBefore': protected_before,
    'protectedAfter': protected_after,
    'crownforgeChangedFilesVerified': actual_changed,
    'blackCrownStatus': 'PROMOTED SEPARATELY — Black Crown v2.1 lateral-glute amendment is protected baseline, not part of this Crownforge candidate',
}
(root / '.book-informed-program-delta-candidate.json').write_text(json.dumps(marker, indent=2) + '\n')
print('Book-informed Crownforge candidate applied against protected Black Crown v2.1 baseline; Crown Maintenance unchanged.')
PY
