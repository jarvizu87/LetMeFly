#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
cp "$ROOT_DIR/overlays/auth/conflict-recovery-v1.ts" "$TARGET/src/sync/conflict-recovery.ts"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1]) / 'src/sync'
def replace(path, old, new):
    text = path.read_text()
    if text.count(old) != 1:
        raise SystemExit(f'Expected exactly one conflict-recovery anchor in {path}: {old}')
    path.write_text(text.replace(old, new))
local = root / 'local-sync.ts'
local.write_text("import { equivalentWorkoutSets } from './conflict-recovery'\n" + local.read_text())
replace(local, 'semanticallyEqual(current, payload)', "semanticallyEqual(current, payload) || (storeName === 'workoutSets' && equivalentWorkoutSets(current, payload))")
engine = root / 'sync-engine.ts'
engine.write_text("import { equivalentWorkoutSets, resolveConvergedSetConflicts } from './conflict-recovery'\n" + engine.read_text())
replace(engine, "} else if (response.status === 'conflict') {", """} else if (response.status === 'conflict' &&
          candidate.entry.entityType === 'workoutSets' &&
          response.remote_payload &&
          Number.isSafeInteger(response.server_revision) && Number(response.server_revision) > 0 &&
          response.remote_payload.revision === response.server_revision &&
          equivalentWorkoutSets(candidate.current, response.remote_payload)) {
          // A concurrent/idempotent upload already stored this exact set.
          // acknowledge preserves edits made locally while the request ran.
          await acknowledge(candidate, { ...response, status: 'applied' })
          result.pushed += 1
        } else if (response.status === 'conflict') {""")
replace(engine, '    result.pending = await pendingCount(this.athleteId)\n    return result\n  }', '    await resolveConvergedSetConflicts(this.athleteId)\n    result.pending = await pendingCount(this.athleteId)\n    return result\n  }')
PY
echo 'LetMeFly verified duplicate-conflict recovery: APPLIED'
