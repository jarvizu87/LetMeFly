#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?reconstructed app root required}"
MAIN="$TARGET/src/main.ts"
RESTORE="$TARGET/src/restore/restore-service.ts"

test -s "$MAIN"
test -s "$RESTORE"

python3 - "$MAIN" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()

def replace_once(old,new):
    global s
    count=s.count(old)
    assert count==1,(count,old[:160])
    s=s.replace(old,new,1)

create='''<button class="btn primary" style="width:100%;margin-top:14px" data-action="create-athlete">Create Local Athlete</button>'''
import_backup='''<button class="btn primary" style="width:100%;margin-top:14px" data-action="create-athlete">Create Local Athlete</button><label class="btn ghost" style="width:100%;margin-top:10px;text-align:center;box-sizing:border-box" for="onboard-restore-file"><span aria-hidden="true">↥</span> Import Backup</label><input id="onboard-restore-file" type="file" accept=".json,application/json" hidden>'''
replace_once(create,import_backup)

bind='''  document.querySelector('[data-action="create-athlete"]')?.addEventListener('click', createAthleteFromOnboarding)'''
replace_once(bind,bind+'''\n  document.querySelector<HTMLInputElement>('#onboard-restore-file')?.addEventListener('change', restoreFileSelected)''')

# Make the final confirmation truthful both on a fresh device and when replacing
# an existing local athlete. The restore service itself remains authoritative.
old='''  if (!confirm(`Restore ${preview.athleteName} using ${mode}? Current local athlete will be backed up before replacement.`)) return'''
new='''  const restoreImpact = state.athlete
    ? 'Current local athlete will be backed up before replacement.'
    : 'This verified backup will become the local athlete on this device.'
  if (!confirm(`Restore ${preview.athleteName} using ${mode}? ${restoreImpact}`)) return'''
replace_once(old,new)

p.write_text(s)
PY

# Source contract: onboarding delegates to the same verified restore path as
# Profile > Data & Backups. No duplicate parser/database replacement path exists.
grep -Fq 'id="onboard-restore-file"' "$MAIN"
grep -Fq '> Import Backup</label>' "$MAIN"
grep -Fq "'#onboard-restore-file')?.addEventListener('change', restoreFileSelected)" "$MAIN"
grep -Fq 'const preview = await previewRestoreText(text)' "$MAIN"
grep -Fq 'const result = await restoreFromBackup(preview.backup, mode, APP_VERSION)' "$MAIN"
grep -Fq "if (!result.verification.valid) throw new Error('Post-restore verification failed')" "$MAIN"
grep -Fq 'if (currentAthleteId) {' "$RESTORE"
grep -Fq "mode === 'portable-import'" "$RESTORE"
grep -Fq 'await replaceLocalDataAtomically(staged)' "$RESTORE"

echo 'LetMeFly onboarding verified-backup import entry point: APPLIED'
