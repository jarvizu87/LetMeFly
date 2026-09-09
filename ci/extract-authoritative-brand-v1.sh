#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-}"
TRANSPORT_DIR="$ROOT_DIR/overlays/ui-command-v2/brand-v1/transport"
TRANSPORT_PREFIX="$TRANSPORT_DIR/brand-icons-q256-v1.tar.gz.b64"

ICON_192_SHA="978b556783eeeaa4f0d87b8d929fcc22b91f0cbb05f61c8d29f1869d83e87e39"
ICON_512_SHA="864067cda8175f18919ca038c4b1d9bf82a865fceb4438ebe777bb0c1ac4c743"
ICON_MASKABLE_SHA="0e0262a8600d3fe62e45b645731264ea930ca4fd70ac28f91e1f671bf0d0fd5f"

if [[ -z "$OUT_DIR" ]]; then
  echo "Usage: $0 <output-directory>" >&2
  exit 2
fi

chunks=()
for suffix in 00 01 02 03 04 05 06 07 08; do
  chunk="$TRANSPORT_PREFIX.$suffix"
  test -s "$chunk" || { echo "Missing authoritative brand transport chunk: $chunk" >&2; exit 1; }
  chunks+=("$chunk")
done

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/brand-icons-q256-v1.tar.gz"

cat "${chunks[@]}" | base64 --decode > "$ARCHIVE"
gzip -t "$ARCHIVE"
tar -tzf "$ARCHIVE" >/dev/null
tar -xzf "$ARCHIVE" -C "$OUT_DIR"

ICON_192="$OUT_DIR/letmefly-app-icon-192-v1.png"
ICON_512="$OUT_DIR/letmefly-app-icon-512-v1.png"
ICON_MASKABLE="$OUT_DIR/letmefly-app-icon-512-maskable-v1.png"
for f in "$ICON_192" "$ICON_512" "$ICON_MASKABLE"; do
  test -s "$f" || {
    echo "Authoritative brand transport did not reconstruct required file: $f" >&2
    echo "Transport contents:" >&2
    tar -tzf "$ARCHIVE" >&2
    exit 1
  }
done

echo "$ICON_192_SHA  $ICON_192" | sha256sum -c -
echo "$ICON_512_SHA  $ICON_512" | sha256sum -c -
echo "$ICON_MASKABLE_SHA  $ICON_MASKABLE" | sha256sum -c -

echo "Authoritative brand transport archive SHA-256: $(sha256sum "$ARCHIVE" | awk '{print $1}')"
echo "LetMeFly authoritative logo derivatives reconstructed and verified: PASS"
