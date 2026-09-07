#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app}"
PROGRAM_OVERLAY_DIR="$ROOT_DIR/overlays/program-data/crownforge-v2-1"
EXPECTED_PROGRAM_B64_SHA="275cd158b8c207f5ad8675fb1a4ff73b7889046a15ce3eddcda901a512a50800"
EXPECTED_PROGRAM_GZIP_SHA="6dc0048164f10d6a78bcd6be0867d30bb1f63707f03d02b8732d7a373fc5b210"
EXPECTED_PROGRAM_PATCH_SHA="59e5b6041844abccf632134ce903947b36a58eebaca62a0e3adbe818adcef712"
EXPECTED_PROGRAM_B64_SIZE="81978"
EXPECTED_PROGRAM_GZIP_SIZE="60857"
EXPECTED_PROGRAM_PATCH_SIZE="329460"
EXPECTED_PROGRAM_CHUNKS="11"
DRIVE_SYNC_PATCH="$PROGRAM_OVERLAY_DIR/drive-sync-v2-1.patch"
EXPECTED_DRIVE_SYNC_PATCH_SHA="8fd91e70ce5ea14c7c75d37aaa28d550584bf06ed5291d5e045f55000b2bf2bf"
EXPECTED_DRIVE_SYNC_PATCH_SIZE="8535"
WEEKS_DRIVE_SYNC_B64="$PROGRAM_OVERLAY_DIR/drive-sync-v2-1-weeks1-14.patch.gz.b64"
EXPECTED_WEEKS_DRIVE_SYNC_B64_SHA="6d4422dc4748de0c289556b750b1fa79ac1a96cb0e2c9da9d54c96c31738a9c9"
EXPECTED_WEEKS_DRIVE_SYNC_B64_SIZE="7661"
EXPECTED_WEEKS_DRIVE_SYNC_GZIP_SHA="6cff2f215fd1f6f367791caa2339a5ab879f021878e85376cf20bc1592bfb904"
EXPECTED_WEEKS_DRIVE_SYNC_GZIP_SIZE="5745"
EXPECTED_WEEKS_DRIVE_SYNC_PATCH_SHA="d25015597ca8bbd82f282b1382041fd8d1caa55e8e20b5c2d73ccee351115970"
EXPECTED_WEEKS_DRIVE_SYNC_PATCH_SIZE="28038"
LEGACY_AUDIT_SYNC_PATCH="$PROGRAM_OVERLAY_DIR/drive-sync-v2-1-legacy-audits.patch"
EXPECTED_LEGACY_AUDIT_SYNC_PATCH_SHA="221b20dd729cb9eb5843418b8f68c7d915ee41e367342fd8ada6bb661b31947a"
EXPECTED_LEGACY_AUDIT_SYNC_PATCH_SIZE="1013"

PROGRAM_B64_FILE="$(mktemp)"
PROGRAM_GZIP_FILE="$(mktemp)"
PROGRAM_PATCH_FILE="$(mktemp)"
WEEKS_DRIVE_SYNC_GZIP_FILE="$(mktemp)"
WEEKS_DRIVE_SYNC_PATCH_FILE="$(mktemp)"
trap 'rm -f "$PROGRAM_B64_FILE" "$PROGRAM_GZIP_FILE" "$PROGRAM_PATCH_FILE" "$WEEKS_DRIVE_SYNC_GZIP_FILE" "$WEEKS_DRIVE_SYNC_PATCH_FILE"' EXIT

if [[ ! -d "$TARGET_DIR" || ! -f "$TARGET_DIR/package.json" ]]; then
  echo "Crownforge target source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

shopt -s nullglob
PROGRAM_CHUNKS=("$PROGRAM_OVERLAY_DIR"/source.patch.gz.b64.*)
if [[ "${#PROGRAM_CHUNKS[@]}" -ne "$EXPECTED_PROGRAM_CHUNKS" ]]; then
  echo "Expected $EXPECTED_PROGRAM_CHUNKS Crownforge overlay chunks, found ${#PROGRAM_CHUNKS[@]}" >&2
  exit 1
fi

cat "${PROGRAM_CHUNKS[@]}" > "$PROGRAM_B64_FILE"
test "$(wc -c < "$PROGRAM_B64_FILE")" = "$EXPECTED_PROGRAM_B64_SIZE"
echo "$EXPECTED_PROGRAM_B64_SHA  $PROGRAM_B64_FILE" | sha256sum -c -

base64 -d "$PROGRAM_B64_FILE" > "$PROGRAM_GZIP_FILE"
test "$(wc -c < "$PROGRAM_GZIP_FILE")" = "$EXPECTED_PROGRAM_GZIP_SIZE"
echo "$EXPECTED_PROGRAM_GZIP_SHA  $PROGRAM_GZIP_FILE" | sha256sum -c -
gzip -t "$PROGRAM_GZIP_FILE"

gzip -dc "$PROGRAM_GZIP_FILE" > "$PROGRAM_PATCH_FILE"
test "$(wc -c < "$PROGRAM_PATCH_FILE")" = "$EXPECTED_PROGRAM_PATCH_SIZE"
echo "$EXPECTED_PROGRAM_PATCH_SHA  $PROGRAM_PATCH_FILE" | sha256sum -c -

test -f "$DRIVE_SYNC_PATCH"
test "$(wc -c < "$DRIVE_SYNC_PATCH")" = "$EXPECTED_DRIVE_SYNC_PATCH_SIZE"
echo "$EXPECTED_DRIVE_SYNC_PATCH_SHA  $DRIVE_SYNC_PATCH" | sha256sum -c -

test -f "$WEEKS_DRIVE_SYNC_B64"
test "$(wc -c < "$WEEKS_DRIVE_SYNC_B64")" = "$EXPECTED_WEEKS_DRIVE_SYNC_B64_SIZE"
echo "$EXPECTED_WEEKS_DRIVE_SYNC_B64_SHA  $WEEKS_DRIVE_SYNC_B64" | sha256sum -c -
base64 -d "$WEEKS_DRIVE_SYNC_B64" > "$WEEKS_DRIVE_SYNC_GZIP_FILE"
test "$(wc -c < "$WEEKS_DRIVE_SYNC_GZIP_FILE")" = "$EXPECTED_WEEKS_DRIVE_SYNC_GZIP_SIZE"
echo "$EXPECTED_WEEKS_DRIVE_SYNC_GZIP_SHA  $WEEKS_DRIVE_SYNC_GZIP_FILE" | sha256sum -c -
gzip -t "$WEEKS_DRIVE_SYNC_GZIP_FILE"
gzip -dc "$WEEKS_DRIVE_SYNC_GZIP_FILE" > "$WEEKS_DRIVE_SYNC_PATCH_FILE"
test "$(wc -c < "$WEEKS_DRIVE_SYNC_PATCH_FILE")" = "$EXPECTED_WEEKS_DRIVE_SYNC_PATCH_SIZE"
echo "$EXPECTED_WEEKS_DRIVE_SYNC_PATCH_SHA  $WEEKS_DRIVE_SYNC_PATCH_FILE" | sha256sum -c -

test -f "$LEGACY_AUDIT_SYNC_PATCH"
test "$(wc -c < "$LEGACY_AUDIT_SYNC_PATCH")" = "$EXPECTED_LEGACY_AUDIT_SYNC_PATCH_SIZE"
echo "$EXPECTED_LEGACY_AUDIT_SYNC_PATCH_SHA  $LEGACY_AUDIT_SYNC_PATCH" | sha256sum -c -

(
  cd "$TARGET_DIR"
  patch --dry-run -p1 < "$PROGRAM_PATCH_FILE"
  patch -p1 < "$PROGRAM_PATCH_FILE"

  # Sync the modular Crown Maintenance package to the approved Crownforge v2.1
  # Drive reference without modifying Crownforge week numbering or UI layers.
  patch --dry-run -p1 < "$DRIVE_SYNC_PATCH"
  patch -p1 < "$DRIVE_SYNC_PATCH"

  # Sync Crownforge Weeks 1-14 against the approved Drive v2.1 source.
  # The patch changes only confirmed prescription drift; Weeks 13-14 were
  # audited and require no prescription edits.
  patch --dry-run -p1 < "$WEEKS_DRIVE_SYNC_PATCH_FILE"
  patch -p1 < "$WEEKS_DRIVE_SYNC_PATCH_FILE"

  # Keep legacy regression scripts aligned with the approved source so
  # historical assertions do not reject corrected prescriptions.
  patch --dry-run -p1 < "$LEGACY_AUDIT_SYNC_PATCH"
  patch -p1 < "$LEGACY_AUDIT_SYNC_PATCH"

  # Architecture boundaries: prescriptions belong to program packages, never the registry/facade.
  test -f src/program-engine/types.ts
  test -f src/program-engine/builders.ts
  test -f src/programs/registry.ts
  test -f src/programs/crownforge/index.ts
  test -f src/programs/crown-maintenance/index.ts
  test -f src/programs/black-crown/index.ts
  grep -Fq "crownforge" src/programs/registry.ts
  grep -Fq "crown-maintenance" src/programs/registry.ts
  grep -Fq "black-crown" src/programs/registry.ts
  ! grep -Eq "sets:[[:space:]]*[0-9]|loadLbs:|reps:" src/programs/registry.ts
  ! grep -Eq "sets:[[:space:]]*[0-9]|loadLbs:|reps:" src/data/programs.ts
  grep -Fq "rounding: 'up-5'" src/programs/crown-maintenance/weeks.ts
  grep -Fq "pct(String(i + 1), 5, 70, 'verified-bench-press-1rm')" src/programs/crown-maintenance/weeks.ts
  grep -Fq "pct(String(i + 1), 4, 72.5, 'verified-bench-press-1rm')" src/programs/crown-maintenance/weeks.ts
  grep -Fq "Weeks 1–12 approved Drive v2.1 source-sync corrections: checked" scripts/audit-crownforge-full.mjs
)

echo "Crownforge v2.1 modular program-data overlay + approved full-program Drive sync: PASS"
