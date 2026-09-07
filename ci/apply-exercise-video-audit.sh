#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
LIB_FILE="$TARGET_DIR/src/data/exercise-library.ts"

if [[ -z "$TARGET_DIR" || ! -f "$LIB_FILE" ]]; then
  echo "LetMeFly exercise library is missing: $LIB_FILE" >&2
  exit 1
fi

LIB_FILE="$LIB_FILE" python - <<'PY'
from pathlib import Path
from urllib.parse import quote_plus
import os
import re

p = Path(os.environ['LIB_FILE'])
text = p.read_text()

# Audit rule: never ship a legacy Vimeo direct link as a vetted exercise demo.
# The mobile release already has a specifically approved Front Squat YouTube demo.
# Every other legacy Vimeo record is demoted to an exact-name YouTube search fallback
# until a new direct instructional source is manually approved.
legacy_direct = re.compile(
    r"direct\('([^']+)',\s*'https://vimeo\.com/\d+'"
)

converted = []
def replace_legacy(match):
    name = match.group(1)
    converted.append(name)
    query = quote_plus(f"{name} exercise tutorial")
    return f"fallback('{name}', 'https://www.youtube.com/results?search_query={query}'"

text = legacy_direct.sub(replace_legacy, text)

# Search fallbacks should search for the exact canonical exercise only. Remove stale
# provider prefixes, alternate movements, and literal 'YouTube Search' wording that
# can send the athlete to the wrong demonstration.
search_call = re.compile(
    r"\b(plan|fallback)\('([^']+)',\s*'https://www\.youtube\.com/results\?search_query=[^']*'"
)

def normalize_search(match):
    kind, name = match.group(1), match.group(2)
    query = quote_plus(f"{name} exercise tutorial")
    return f"{kind}('{name}', 'https://www.youtube.com/results?search_query={query}'"

text = search_call.sub(normalize_search, text)
p.write_text(text)

records = re.findall(
    r"\b(direct|plan|fallback)\('([^']+)',\s*'([^']+)'",
    text,
)
if not records:
    raise SystemExit('no exercise video records found after audit')

errors = []
for kind, name, url in records:
    if 'vimeo.com/' in url:
        errors.append(f'{name}: legacy Vimeo URL remains')
    if kind == 'direct':
        if not (
            url.startswith('https://www.youtube.com/watch?v=')
            or url.startswith('https://youtu.be/')
        ):
            errors.append(f'{name}: direct-source-library is not a direct YouTube video: {url}')
    else:
        if not url.startswith('https://www.youtube.com/results?search_query='):
            errors.append(f'{name}: search status is not a YouTube search fallback: {url}')

if errors:
    raise SystemExit('\n'.join(errors))

print(f'exercise video records audited: {len(records)}')
print(f'legacy Vimeo direct records demoted to safe search fallbacks: {len(converted)}')
for name in converted:
    print(f'  fallback: {name}')
PY

! grep -Rq 'vimeo.com/' "$LIB_FILE"
grep -Fq "direct('Front Squat', 'https://www.youtube.com/watch?v=-fNfycATWUo'" "$LIB_FILE"
! grep -Fq 'YouTube+Search+' "$LIB_FILE"
! grep -Fq '+or+' "$LIB_FILE"

echo "LetMeFly exercise video link audit: PASS"
