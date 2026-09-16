#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
mkdir -p "$TARGET/src/barbell-settings"
cp "$ROOT_DIR/overlays/barbell-settings-v1/contract.mjs" "$ROOT_DIR/overlays/barbell-settings-v1/contract.d.mts" "$TARGET/src/barbell-settings/"
TARGET="$TARGET" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['TARGET'])/'src/main.ts'
s = p.read_text()
assert 'LetMeFlyBarbellSettings' not in s, 'Barbell settings bridge already installed'
s = "import { resolveBarbellSettings } from './barbell-settings/contract.mjs'\nimport { getAllFromIndex as getBarbellPreferences } from './db/local-db'\n" + s
needle = 'function render(): void {\n'
assert s.count(needle) == 1
s = s.replace(needle, needle + '  void refreshBarbellSettings().catch(() => undefined)\n')
s += '''
// Read-only athlete preferences; utility overrides remain local to this device.
let barbellPreference: Record<string, any> | null = null
let barbellPreferenceAthlete: string | null = null
let barbellPreferenceSignature = ''
let barbellReadRevision = 0
async function refreshBarbellSettings(): Promise<void> {
  const request = ++barbellReadRevision
  const athlete = await getActiveAthlete()
  const rows = athlete ? await getBarbellPreferences<LocalDomainRecord>('athletePreferences', 'by-athlete', athlete.id) : []
  if (request !== barbellReadRevision || (await getActiveAthlete())?.id !== athlete?.id) return
  const row = rows.filter(r => !r.deleted_at && r.athlete_id === athlete?.id).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null
  const signature = JSON.stringify([athlete?.id ?? null, row])
  if (signature === barbellPreferenceSignature) return
  barbellPreference = row
  barbellPreferenceAthlete = athlete?.id ?? null
  barbellPreferenceSignature = signature
  window.dispatchEvent(new Event('lmf:barbell-settings-changed'))
}
;(window as unknown as Record<string, unknown>).LetMeFlyBarbellSettings = Object.freeze({
  version: 1,
  read(defaults: Record<string, any>) {
    let saved: unknown = null
    try { saved = JSON.parse(localStorage.getItem('letmefly-bar-loader-v1') || 'null') } catch (_) { /* Invalid device preference. */ }
    return resolveBarbellSettings(defaults, saved, state.athlete?.id === barbellPreferenceAthlete ? barbellPreference : null)
  },
  refresh: refreshBarbellSettings,
})
'''
p.write_text(s)
PY

# Whole-gym inventories can exceed the older rack-sized 12-pair ceiling. Keep
# the plate diagram clipped for readability, but let the utility store and use
# up to 24 pairs of any denomination so a large powerlifting gym can be modeled
# once without future inventory edits.
LOADER="$TARGET/public/ui/smart-names-bar-loader-v1.js"
test -s "$LOADER" || { echo "Missing Bar Loader runtime target: $LOADER" >&2; exit 1; }
LOADER="$LOADER" python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ['LOADER'])
s = p.read_text()
solver = "Math.min(12, Number.parseInt(pairs[String(denom)] ?? 0, 10) || 0)"
entry = "Math.min(12, Number.parseInt(input.value || '0', 10) || 0)"
if s.count(solver) != 1:
    raise SystemExit(f'Expected one solver pair ceiling, found {s.count(solver)}')
if s.count(entry) != 2:
    raise SystemExit(f'Expected two inventory entry ceilings, found {s.count(entry)}')
if s.count('max="12"') != 1:
    raise SystemExit(f'Expected one inventory input max, found {s.count("max=\"12\"")}')
s = s.replace(solver, "Math.min(24, Number.parseInt(pairs[String(denom)] ?? 0, 10) || 0)", 1)
s = s.replace(entry, "Math.min(24, Number.parseInt(input.value || '0', 10) || 0)")
s = s.replace('max="12"', 'max="24"', 1)
p.write_text(s)
PY
grep -Fq 'max="24"' "$LOADER"
grep -Fq "Math.min(24, Number.parseInt(pairs[String(denom)]" "$LOADER"
grep -Fq "Math.min(24, Number.parseInt(input.value" "$LOADER"

node --test "$ROOT_DIR/ci/audit-barbell-settings.mjs"
