#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
test -s "$MAIN" || { echo "Missing substitution main target: $MAIN" >&2; exit 1; }

MAIN="$MAIN" python3 - <<'PY'
from pathlib import Path
import os

path = Path(os.environ['MAIN'])
text = path.read_text()
old = """  const prescribedKey = String(item.record.substituted_from_exercise_key ?? snapshot.prescribedExerciseKey ?? item.record.exercise_key)\n  const intelligence = (window as any).LetMeFlyExerciseIntelligence\n  const rules = intelligence?.getSubstitutions?.(prescribedKey, { includeBlocked: true }) ?? []"""
new = """  const prescribedKey = String(item.record.substituted_from_exercise_key ?? snapshot.prescribedExerciseKey ?? item.record.exercise_key)\n  const prescribedName = String(snapshot.prescribedExerciseName ?? item.record.exercise_name_snapshot)\n  const intelligence = (window as any).LetMeFlyExerciseIntelligence\n  const governedPrimary = intelligence?.getExercise?.(prescribedKey) ?? intelligence?.getExercise?.(prescribedName)\n  const governedPrimaryKey = String(governedPrimary?.id ?? prescribedKey)\n  const rules = intelligence?.getSubstitutions?.(governedPrimaryKey, { includeBlocked: true }) ?? []"""
if old not in text:
    if 'governedPrimaryKey' in text:
        print('Issue #54 governed substitution name resolution already normalized')
    else:
        raise SystemExit('Issue #54 governance normalization patch point missing')
else:
    text = text.replace(old, new, 1)

text = text.replace(
    "    prescribedName: String(snapshot.prescribedExerciseName ?? item.record.exercise_name_snapshot),",
    "    prescribedName,",
    1,
)
path.write_text(text)
PY

grep -Fq 'const governedPrimary = intelligence?.getExercise?.(prescribedKey) ?? intelligence?.getExercise?.(prescribedName)' "$MAIN"
grep -Fq 'getSubstitutions?.(governedPrimaryKey, { includeBlocked: true })' "$MAIN"

echo "Issue #54 governed substitution program-key/name resolution: PASS"
