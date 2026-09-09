#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
BRAND_ARCHIVE="$ROOT_DIR/overlays/ui-command-v2/brand-v1/official-brand-assets-v1.tar.gz"
ICON_512_SHA="864067cda8175f18919ca038c4b1d9bf82a865fceb4438ebe777bb0c1ac4c743"
LOGO_PATH="$TARGET_DIR/public/ui/letmefly-official-logo-512.png"

if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" || ! -f "$TARGET_DIR/src/command-v2.css" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

test -s "$BRAND_ARCHIVE"
# Validate the archive structurally, then validate the authoritative extracted
# artwork by exact SHA-256. This protects the actual shipped pixels while
# avoiding false failures from gzip/tar container metadata.
tar -tzf "$BRAND_ARCHIVE" >/dev/null
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$BRAND_ARCHIVE" -C "$TMP"
echo "$ICON_512_SHA  $TMP/letmefly-app-icon-512-v1.png" | sha256sum -c -

mkdir -p "$TARGET_DIR/public/ui"
cp "$TMP/letmefly-app-icon-512-v1.png" "$LOGO_PATH"
echo "$ICON_512_SHA  $LOGO_PATH" | sha256sum -c -

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET_DIR'])
p = root / 'src/main.ts'
text = p.read_text()
old_candidates = [
    '<img class="lmf-official-more-logo" src="/app-icon-v4.svg?v=4" alt="LetMeFly" />',
    '<img class="lmf-official-more-logo" src="/ui/letmefly-official-logo-512.png?v=6" alt="LetMeFly" decoding="async" />',
]
new = '<img class="lmf-official-more-logo" src="/ui/letmefly-official-logo-512.png?v=8" alt="LetMeFly" decoding="async" />'
if new not in text:
    matches = [old for old in old_candidates if old in text]
    if len(matches) != 1:
        raise SystemExit(f'expected one known More-tab logo reference, found {len(matches)}')
    text = text.replace(matches[0], new, 1)
p.write_text(text)
PY

cat >> "$TARGET_DIR/src/command-v2.css" <<'CSS'

/* More-tab authoritative logo v8: approved master raster only. */
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

grep -Fq '/ui/letmefly-official-logo-512.png?v=8' "$TARGET_DIR/src/main.ts"
! grep -Fq 'letmefly-app-icon-512-v2.png' "$TARGET_DIR/src/main.ts"
grep -Fq 'More-tab authoritative logo v8' "$TARGET_DIR/src/command-v2.css"

echo "LetMeFly More-tab authoritative master logo fix: PASS"
