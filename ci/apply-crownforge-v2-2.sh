#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
MANIFEST="$ROOT_DIR/overlays/program-data/crownforge-v2-2/REVISION_MANIFEST.json"

[[ -d "$TARGET/src/programs/crownforge" ]]
[[ -d "$TARGET/src/programs/crown-maintenance" ]]
[[ -d "$TARGET/src/programs/black-crown" ]]
[[ -f "$MANIFEST" ]]

python - "$TARGET" "$MANIFEST" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest_path = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text())
if manifest.get('version') != 'v2.2' or manifest.get('baseVersion') != 'v2.1':
    raise SystemExit('Crownforge v2.2 revision manifest mismatch')

cf_root = root / 'src/programs/crownforge'
maintenance = root / 'src/programs/crown-maintenance'
black_crown = root / 'src/programs/black-crown'


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

bc_metadata = (black_crown / 'metadata.ts').read_text()
if "version: 'v2.1'" not in bc_metadata:
    raise SystemExit('Crownforge v2.2 requires Black Crown Revised v2.1 protected baseline')

protected_before = {
    'blackCrown': tree_hash(black_crown),
    'crownMaintenance': tree_hash(maintenance),
}
cf_before = file_hashes(cf_root)

conditional_note = (
    'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; '
    'omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'
)

changes = {
    cf_root / 'weeks/week-01.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Primer.'),",
        f"ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], '{conditional_note}'),",
    ),
    cf_root / 'weeks/week-02.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], 'Primer.'),",
        f"ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', [s('1', 10, '16 kg (35 lb) KB'), s('2', 10, '16 kg (35 lb) KB')], '{conditional_note}'),",
    ),
    cf_root / 'weeks/weeks-03-06.ts': (
        "ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory', repeated(2, 10, config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)), 'Primer.'),",
        f"ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional', repeated(2, 10, config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)), '{conditional_note}'),",
    ),
}

changed = []
for path, (needle, replacement) in changes.items():
    if not path.is_file():
        raise SystemExit(f'missing Crownforge source file: {path}')
    text = path.read_text()
    if text.count(needle) != 1:
        raise SystemExit(f'{path.relative_to(root)} expected one v2.1 primer patch point, found {text.count(needle)}')
    updated = text.replace(needle, replacement, 1)
    if updated.count("kb-swing-primer-d6") != text.count("kb-swing-primer-d6"):
        raise SystemExit(f'{path.relative_to(root)} changed primer-definition count unexpectedly')
    path.write_text(updated)
    changed.append(str(path.relative_to(root)))

metadata = cf_root / 'metadata.ts'
meta_text = metadata.read_text()
if meta_text.count("version: 'v2.1'") != 1:
    raise SystemExit(f'Crownforge metadata expected one v2.1 version marker, found {meta_text.count("version: \'v2.1\'")}')
meta_text = meta_text.replace("version: 'v2.1'", "version: 'v2.2'", 1)
metadata.write_text(meta_text)
changed.append(str(metadata.relative_to(root)))

protected_after = {
    'blackCrown': tree_hash(black_crown),
    'crownMaintenance': tree_hash(maintenance),
}
if protected_before != protected_after:
    raise SystemExit('Crownforge v2.2 modified protected Black Crown v2.1 or Crown Maintenance')

cf_after = file_hashes(cf_root)
if set(cf_before) != set(cf_after):
    raise SystemExit('Crownforge v2.2 added or removed Crownforge program files')
actual_changed = sorted(
    f'src/programs/crownforge/{rel}'
    for rel in cf_before
    if cf_before[rel] != cf_after[rel]
)
expected_changed = sorted(changed)
if actual_changed != expected_changed:
    raise SystemExit('Crownforge v2.2 changed unexpected files: ' + json.dumps({'expected': expected_changed, 'actual': actual_changed}))

marker = {
    'program': 'Crownforge',
    'version': 'v2.2',
    'baseVersion': 'v2.1',
    'revisionId': manifest['revisionId'],
    'affectedWeeks': manifest['affectedWeeks'],
    'affectedDay': 6,
    'changedFiles': actual_changed,
    'protectedBefore': protected_before,
    'protectedAfter': protected_after,
    'decision': manifest['evidenceDecision'],
}
(root / '.crownforge-v2-2-book-informed.json').write_text(json.dumps(marker, indent=2) + '\n')
print('Crownforge v2.2 book-informed amendment applied; Black Crown v2.1 and Crown Maintenance unchanged.')
PY
