#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
LOGO_URL="https://res.cloudinary.com/extor5az/image/upload/v1788815215/letmefly/app-brand/letmefly-app-icon-512-v2.png"
LOGO_PATH="$TARGET_DIR/public/ui/letmefly-official-logo-512.png"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/command-v2.css" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR/public/ui"
curl -fL "$LOGO_URL" -o "$LOGO_PATH"
test -s "$LOGO_PATH"

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET_DIR'])
p = root / 'src/main.ts'
text = p.read_text()
old = '<img class="lmf-official-more-logo" src="/app-icon-v4.svg?v=4" alt="LetMeFly" />'
new = '<img class="lmf-official-more-logo" src="/ui/letmefly-official-logo-512.png?v=6" alt="LetMeFly" decoding="async" />'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one More-tab SVG logo reference, found {count}')
p.write_text(text.replace(old, new, 1))
PY

cat >> "$TARGET_DIR/src/command-v2.css" <<'CSS'

/* More-tab official logo v6: use the verified raster brand asset locally. */
.more-brand.lmf-official-more-brand .lmf-official-more-logo{
  display:block!important;
  width:min(220px,60vw)!important;
  height:auto!important;
  max-height:none!important;
  object-fit:contain!important;
  border-radius:0!important;
  background:transparent!important;
}
@media(max-width:430px){
  .more-brand.lmf-official-more-brand .lmf-official-more-logo{width:min(190px,58vw)!important}
}
CSS

test -s "$LOGO_PATH"
grep -Fq '/ui/letmefly-official-logo-512.png?v=6' "$TARGET_DIR/src/main.ts"
! grep -Fq '<img class="lmf-official-more-logo" src="/app-icon-v4.svg?v=4"' "$TARGET_DIR/src/main.ts"
grep -Fq 'More-tab official logo v6' "$TARGET_DIR/src/command-v2.css"

echo "LetMeFly More-tab local raster logo fix: PASS"
