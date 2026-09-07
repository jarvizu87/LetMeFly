#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
OVERLAY_DIR="$ROOT_DIR/overlays/program-data/black-crown-v2-0"
MANIFEST="$OVERLAY_DIR/BLOCK_MANIFESTS.json"

[[ -d "$TARGET_DIR/src/programs/black-crown" ]]
[[ -f "$MANIFEST" ]]

hash_tree() {
  local path="$1"
  find "$path" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

CROWNFORGE_BEFORE="$(hash_tree "$TARGET_DIR/src/programs/crownforge")"
MAINTENANCE_BEFORE="$(hash_tree "$TARGET_DIR/src/programs/crown-maintenance")"

rm -rf "$TARGET_DIR/src/programs/black-crown/source-weeks"
mkdir -p "$TARGET_DIR/src/programs/black-crown/source-weeks"
cp "$OVERLAY_DIR/files/src/programs/black-crown/source-types.ts" \
  "$TARGET_DIR/src/programs/black-crown/source-types.ts"

python - "$OVERLAY_DIR" "$TARGET_DIR" <<'PY'
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import sys
import tarfile
from pathlib import Path

overlay = Path(sys.argv[1])
target = Path(sys.argv[2])
manifest = json.loads((overlay / 'BLOCK_MANIFESTS.json').read_text())
out_dir = target / 'src/programs/black-crown/source-weeks'

seen_weeks: set[int] = set()

for block in manifest['blocks']:
    encoded_path = overlay / 'transport' / block['base64File']
    if not encoded_path.is_file():
        raise SystemExit(f'Missing Black Crown transport: {encoded_path}')

    compact = ''.join(encoded_path.read_text().split())
    compact += '=' * (-len(compact) % 4)
    archive = base64.b64decode(compact, validate=True)
    archive_sha = hashlib.sha256(archive).hexdigest()
    if len(archive) != block['archiveSize']:
        raise SystemExit(
            f"Block {block['block']} archive size mismatch: {len(archive)} != {block['archiveSize']}"
        )
    if archive_sha != block['archiveSha256']:
        raise SystemExit(
            f"Block {block['block']} archive SHA mismatch: {archive_sha} != {block['archiveSha256']}"
        )

    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tf:
        members = [m for m in tf.getmembers() if re.search(r'(^|/)week-\d{2}\.ts$', m.name)]
        if len(members) != 6:
            raise SystemExit(f"Block {block['block']} expected 6 week files, found {len(members)}")
        for member in members:
            match = re.search(r'week-(\d{2})\.ts$', member.name)
            if not match:
                continue
            week = int(match.group(1))
            if week in seen_weeks:
                raise SystemExit(f'Duplicate Black Crown week {week}')
            seen_weeks.add(week)
            payload = tf.extractfile(member)
            if payload is None:
                raise SystemExit(f'Unable to read {member.name}')
            (out_dir / f'week-{week:02d}.ts').write_bytes(payload.read())

expected = set(range(1, 55))
if seen_weeks != expected:
    missing = sorted(expected - seen_weeks)
    extra = sorted(seen_weeks - expected)
    raise SystemExit(f'Black Crown week coverage mismatch. missing={missing} extra={extra}')

index_lines = []
for week in range(1, 55):
    index_lines.append(
        f"import {{ BLACK_CROWN_WEEK_{week:02d}_SOURCE }} from './week-{week:02d}'"
    )
index_lines.append('')
index_lines.append('export const BLACK_CROWN_SOURCE_WEEKS = [')
for week in range(1, 55):
    index_lines.append(f'  BLACK_CROWN_WEEK_{week:02d}_SOURCE,')
index_lines.append('] as const')
index_lines.append('')
(out_dir / 'index.ts').write_text('\n'.join(index_lines))
PY

node "$ROOT_DIR/ci/audit-black-crown-source.mjs" "$TARGET_DIR" "$MANIFEST"

CROWNFORGE_AFTER="$(hash_tree "$TARGET_DIR/src/programs/crownforge")"
MAINTENANCE_AFTER="$(hash_tree "$TARGET_DIR/src/programs/crown-maintenance")"

[[ "$CROWNFORGE_BEFORE" == "$CROWNFORGE_AFTER" ]] || {
  echo "Black Crown import modified Crownforge; refusing build." >&2
  exit 1
}
[[ "$MAINTENANCE_BEFORE" == "$MAINTENANCE_AFTER" ]] || {
  echo "Black Crown import modified Crown Maintenance; refusing build." >&2
  exit 1
}

echo "Black Crown v2.0 source overlay: PASS (54 weeks / 270 sessions staged; Crownforge unchanged)"
