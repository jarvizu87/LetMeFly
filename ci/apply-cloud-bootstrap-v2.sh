#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
PATCH_FILE="$ROOT_DIR/overlays/auth/cloud-bootstrap-v2.patch"

cd "$TARGET"
patch --dry-run -p0 < "$PATCH_FILE"
patch -p0 < "$PATCH_FILE"
grep -Fq 'private async flushBootstrapOutbox' src/auth/bootstrap-service.ts
grep -Fq "mode: 'SYNC_ERROR'" src/auth/private-vault-controller.ts
grep -Fq 'data-cloud-feedback' src/main.ts
echo 'LetMeFly resumable cloud bootstrap v2: APPLIED'
