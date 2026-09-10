#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "NETLIFY RELEASE POLICY AUDIT: FAIL - $*" >&2
  exit 1
}

pass() {
  echo "NETLIFY RELEASE POLICY AUDIT: PASS - $*"
}

test -f netlify.toml || fail "netlify.toml missing"
test -f ci/netlify-deploy-gate.sh || fail "ci/netlify-deploy-gate.sh missing"
test -f AGENTS.md || fail "AGENTS.md deployment guardrails missing"
test -f docs/DEPLOYMENT_WORKFLOW.md || fail "deployment workflow documentation missing"

grep -Fq 'ignore = "bash ./ci/netlify-deploy-gate.sh"' netlify.toml \
  || fail "netlify.toml is not wired to the production deploy gate"

grep -Fq 'CONTEXT' ci/netlify-deploy-gate.sh \
  || fail "deploy gate does not inspect Netlify deploy context"

grep -Fqi '[release netlify]' ci/netlify-deploy-gate.sh \
  || fail "deploy gate does not require the explicit release marker"

grep -Fqi '[release netlify]' AGENTS.md \
  || fail "agent guardrails do not document the production release marker"

# No repository automation may directly publish Netlify production. Production
# is released only through the Git-linked, marker-gated Netlify workflow.
if grep -RInE --exclude='audit-netlify-release-policy.sh' \
  '(netlify[[:space:]]+deploy[^\n]*--prod|netlify[[:space:]]+deploy[^\n]*--context[=[:space:]]+production|/api/v1/sites/[^[:space:]]+/deploys)' \
  .github ci 2>/dev/null; then
  fail "direct Netlify production deployment command/API path found in automation"
fi

pass "production is explicit-only; previews remain the development surface"
