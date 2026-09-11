#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
mkdir -p "$TARGET/src/profile-context"
cp "$ROOT_DIR/overlays/profile-context-v1/contract.mjs" "$ROOT_DIR/overlays/profile-context-v1/contract.d.mts" "$TARGET/src/profile-context/"
cp "$ROOT_DIR/overlays/profile-context-v1/profile-context-service.ts" "$TARGET/src/services/profile-context-service.ts"
TARGET="$TARGET" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['TARGET']) / 'src/main.ts'
text = p.read_text()
if 'LetMeFlyProfileContext' in text: raise SystemExit('Profile bridge must be installed once on reconstructed source')
text = "import { saveProfileContext } from './services/profile-context-service'\nimport { parseProfileImport } from './profile-context/contract.mjs'\n" + text
text += "\n;(window as unknown as Record<string, unknown>).LetMeFlyProfileContext = Object.freeze({ version: 1, save: saveProfileContext, parseImport: parseProfileImport })\n"
p.write_text(text)
PY
node --test "$ROOT_DIR/ci/audit-profile-context.mjs"
