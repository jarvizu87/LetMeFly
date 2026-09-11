#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
ART_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../overlays/ui-command-v2/batch-n" && pwd)" TARGET="$TARGET" python3 - <<'PY'
import os, shutil
from pathlib import Path
source = Path(os.environ['ART_SOURCE'])
folder = Path(os.environ['TARGET'])/'src/exercise-art'
folder.mkdir(parents=True, exist_ok=True)
for name in ['exercise-art-contract.mjs', 'exercise-art-native.mjs', 'exercise-art-native.d.mts']:
    shutil.copyfile(source/name, folder/name)
p = Path(os.environ['TARGET'])/'src/main.ts'
text = p.read_text()
assert 'LetMeFlyExerciseArt' not in text, 'Exercise art bridge already installed'
text = "import { createPrivateArtBridge } from './exercise-art/exercise-art-native.mjs'\nimport { supabase as exerciseArtSupabase } from './auth/supabase-client'\n" + text
needle = 'function render(): void {\n'
assert text.count(needle) == 1
text = text.replace(needle, needle + '  notifyExerciseArtContext(state.athlete?.id ?? null)\n')
text += '''
// Read-only art bridge shares the native Auth client and athlete selection.
let exerciseArtAthlete: string | null = null
const privateArt = createPrivateArtBridge({
  activeAthlete: getActiveAthlete,
  auth: state.cloud.auth,
  client: exerciseArtSupabase,
  configured: () => state.cloud.configured,
})
function notifyExerciseArtContext(id: string | null): void {
  if (exerciseArtAthlete === id) return
  exerciseArtAthlete = id
  privateArt.invalidate()
  window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))
}
state.cloud.auth.onAuthStateChange(() => {
  privateArt.invalidate()
  window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))
})
;(window as unknown as Record<string, unknown>).LetMeFlyExerciseArt = privateArt.bridge
window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))
'''
p.write_text(text)
PY

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node --test "$ROOT_DIR/ci/audit-exercise-art.mjs"
TARGET="$TARGET" python3 - <<'PYTHON'
import os, re
from pathlib import Path
p = Path(os.environ['TARGET'])/'public/service-worker.js'
s = p.read_text()
m = re.search(r'const\s+PRECACHE\s*=\s*\[([^\]]*)\]', s)
assert m, 'Missing offline asset list'
assets = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
assets += ['/ui/exercise-art-contract.mjs', '/ui/exercise-art-cloudinary.js', '/ui/exercise-art-auto.js', '/exercise-art-import.html']
s = s[:m.start()]+'const PRECACHE = ['+', '.join(repr(a) for a in dict.fromkeys(assets))+']'+s[m.end():]
p.write_text(s)
PYTHON
