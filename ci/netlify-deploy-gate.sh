#!/usr/bin/env bash
# Netlify ignore-build gate for LetMeFly.
#
# Netlify's `ignore` command uses inverted exit semantics:
#   0 = skip the build/deploy
#   1 = continue the build/deploy
#
# Development contexts must keep working normally. Production is opt-in and
# requires the exact marker `[release netlify]` in the commit message.

set -u

context="${CONTEXT:-unknown}"
commit_ref="${COMMIT_REF:-HEAD}"

# Deploy Previews, branch deploys, preview servers, and local/dev contexts are
# development surfaces. Never block them with the production credit gate.
if [[ "$context" != "production" ]]; then
  echo "Netlify deploy gate: allowing non-production context '$context'."
  exit 1
fi

commit_message="$(git log -1 --pretty=%B "$commit_ref" 2>/dev/null || true)"

if printf '%s\n' "$commit_message" | grep -Fqi '[release netlify]'; then
  echo "Netlify deploy gate: explicit production release marker found; allowing ONE production build."
  exit 1
fi

echo "Netlify deploy gate: production deploy skipped to protect LetMeFly credits."
echo "To publish intentionally, use a final release PR/merge whose commit message contains: [release netlify]"
exit 0
