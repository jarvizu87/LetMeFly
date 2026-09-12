#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/ci/audit-seven-athlete-runtime.mjs"
TMP="$ROOT_DIR/ci/.seven-athlete-runtime-v2-${BASHPID}.mjs"
trap 'rm -f "$TMP"' EXIT

SOURCE="$SOURCE" TMP="$TMP" python3 - <<'PY'
from pathlib import Path
import os
source = Path(os.environ['SOURCE']).read_text()
old = """const fixtures = contract.athletes.map((row, index) => ({
  ...row,
"""
new = """const fixtures = contract.athletes.map((row, index) => {
  const assertions = row.requiredAssertions ?? row.scenarios?.flatMap(s => s.requiredAssertions ?? []) ?? []
  return {
  ...row,
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete fixture mapping boundary, found {source.count(old)}')
source = source.replace(old, new, 1)
old = "developmentPriorities: row.requiredAssertions.slice(0, 3).join('; '),"
new = "developmentPriorities: assertions.slice(0, 3).join('; '),"
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete assertion mapping boundary, found {source.count(old)}')
source = source.replace(old, new, 1)
old = """  index,
}))
"""
new = """  index,
  }
})
"""
if source.count(old) != 1:
    raise SystemExit(f'Expected one seven-athlete fixture mapping close boundary, found {source.count(old)}')
source = source.replace(old, new, 1)
Path(os.environ['TMP']).write_text(source)
PY

node --check "$TMP"
grep -Fq "row.scenarios?.flatMap" "$TMP"
grep -Fq "developmentPriorities: assertions.slice" "$TMP"
node "$TMP" "$@"
