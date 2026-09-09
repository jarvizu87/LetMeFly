#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
INDEX="$DIST/index.html"
SW="$DIST/service-worker.js"
JS="$DIST/ui/saved-set-controls-v1.js"
CSS="$DIST/ui/saved-set-controls-v1.css"

for required in "$INDEX" "$SW" "$JS" "$CSS"; do
  test -s "$required" || { echo "Saved-set production audit missing: $required" >&2; exit 1; }
done
node --check "$JS"

# The controls are explicit and state-aware: Edit/Undo appear on completed sets;
# Restore appears only after a saved set has been reopened through one of them.
grep -Fq "edit: 'Edit'" "$JS"
grep -Fq "undo: 'Undo'" "$JS"
grep -Fq "restore: 'Restore'" "$JS"
grep -Fq "makeAction('edit', SAVED_SET_ACTIONS.edit)" "$JS"
grep -Fq "makeAction('undo', SAVED_SET_ACTIONS.undo)" "$JS"
grep -Fq "makeAction('restore', SAVED_SET_ACTIONS.restore)" "$JS"
grep -Fq "pending.mode === 'edit' ? 'EDITING SAVED SET' : 'SET UNDONE'" "$JS"

# Native LetMeFly persistence remains the only write boundary. Recovery holds a
# short-lived in-memory snapshot and clicks the existing native toggle to reopen
# or save; it may not write IndexedDB/local/session storage or network state.
grep -Fq 'const recovery = new Map()' "$JS"
grep -Fq 'snapshotRow' "$JS"
grep -Fq 'applySnapshot' "$JS"
grep -Fq 'nativeSetToggle' "$JS"
grep -Fq '.set-check[data-action="toggle-set"]' "$JS"
grep -Fq 'button.click()' "$JS"
! grep -Eq 'indexedDB|localStorage|sessionStorage|supabase|fetch\(|\.put\(|\.add\(' "$JS"

# The feature must ship in the final public shell and stay available offline.
grep -Fq '/ui/saved-set-controls-v1.css?v=1' "$INDEX"
grep -Fq '/ui/saved-set-controls-v1.js?v=1' "$INDEX"
grep -Fq "'/ui/saved-set-controls-v1.css?v=1'" "$SW"
grep -Fq "'/ui/saved-set-controls-v1.js?v=1'" "$SW"
grep -Fq '.lmf-saved-set-actions' "$CSS"
grep -Fq '.lmf-saved-set-restore' "$CSS"

echo "LetMeFly saved-set recovery production contract: PASS (Edit + Undo + Restore via native set persistence)"
