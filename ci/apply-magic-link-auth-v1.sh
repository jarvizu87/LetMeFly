#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
PATCH_FILE="$ROOT_DIR/overlays/auth/magic-link-auth-v1.patch"

test -f "$TARGET/src/auth/auth-service.ts"
test -f "$TARGET/src/auth/private-vault-controller.ts"
test -f "$TARGET/src/main.ts"
test -s "$PATCH_FILE"

cd "$TARGET"
patch --dry-run -p0 < "$PATCH_FILE"
patch -p0 < "$PATCH_FILE"

grep -Fq "emailRedirectTo: authReturnUrl()" src/auth/auth-service.ts
grep -Fq "await supabase.auth.exchangeCodeForSession(code)" src/auth/auth-service.ts
grep -Fq "clearAuthCallbackFromUrl(callbackUrl)" src/auth/auth-service.ts
grep -Fq "this.auth.completeEmailLinkFromUrl" src/auth/private-vault-controller.ts
grep -Fq "ENABLE SYNC — SEND EMAIL" src/main.ts
grep -Fq "Sign-in email sent — use its link or code" src/main.ts

echo "LetMeFly PKCE magic-link authentication callback: APPLIED"
