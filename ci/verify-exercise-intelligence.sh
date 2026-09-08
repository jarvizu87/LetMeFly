#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OVERLAY_DIR="overlays/exercise-intelligence"
MANIFEST="$OVERLAY_DIR/payload/manifest.json"
MATERIALIZER="$OVERLAY_DIR/materialize.mjs"

[[ -f "$MANIFEST" ]]
[[ -f "$MATERIALIZER" ]]

node "$MATERIALIZER" --verify-only

# Protect the architectural boundary: Exercise Intelligence is descriptive and
# substitution-aware, but program packages remain the sole prescription owner.
grep -Fq '"programPrescription": "Program packages only"' "$MANIFEST"
grep -Fq '"exerciseCount": 92' "$MANIFEST"
grep -Fq '"substitutionRuleCount": 25' "$MANIFEST"

echo "Exercise Intelligence overlay verification: PASS"
