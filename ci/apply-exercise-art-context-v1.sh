#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['TARGET'])/'src/main.ts'
text = p.read_text()
assert 'LetMeFlyExerciseArt' not in text, 'Exercise art bridge already installed'
text = "import { supabase as exerciseArtSupabase } from './auth/supabase-client'\n" + text
needle = 'function render(): void {\n'
assert text.count(needle) == 1
text = text.replace(needle, needle + '  notifyExerciseArtContext(state.athlete?.id ?? null)\n')
text += '''
// Read-only art bridge shares the native Auth client and athlete selection.
let exerciseArtAthlete: string | null = null
let exerciseArtAuthEpoch = 0
function notifyExerciseArtContext(id: string | null): void {
  if (exerciseArtAthlete === id) return
  exerciseArtAthlete = id
  window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))
}
state.cloud.auth.onAuthStateChange(() => {
  exerciseArtAuthEpoch += 1
  window.dispatchEvent(new Event('lmf:exercise-art-context-changed'))
})
;(window as unknown as Record<string, unknown>).LetMeFlyExerciseArt = Object.freeze({
  version: 1,
  async context() { return { athleteId: (await getActiveAthlete())?.id ?? null } },
  async readCloud(athleteId: string) {
    const epoch = exerciseArtAuthEpoch
    if (!state.cloud.configured || (await getActiveAthlete())?.id !== athleteId) return []
    const session = await state.cloud.auth.getLocalSession()
    if (!session) return []
    const user = await state.cloud.auth.getTrustedCurrentUser()
    if (!user || user.id !== session.user.id || epoch !== exerciseArtAuthEpoch) return []
    // RLS is authoritative. Both queries target exactly the active local athlete.
    const owned = await exerciseArtSupabase.from('athletes').select('id').eq('id', athleteId).eq('owner_user_id', user.id).is('deleted_at', null)
    if (owned.error || owned.data?.length !== 1 || epoch !== exerciseArtAuthEpoch) return []
    const result = await exerciseArtSupabase.from('exercise_thumbnail_overrides').select('athlete_id,exercise_key,cloudinary_public_id,asset_format,status,is_active,deleted_at').eq('athlete_id', athleteId).eq('status', 'approved').eq('is_active', true).is('deleted_at', null)
    if (result.error || epoch !== exerciseArtAuthEpoch || (await getActiveAthlete())?.id !== athleteId) return []
    return result.data ?? []
  },
})
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
