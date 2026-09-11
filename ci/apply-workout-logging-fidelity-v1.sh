#!/usr/bin/env bash
set -euo pipefail

DIST="${1:?production dist required}"
JS="$DIST/ui/workout-logging-v2.js"
test -s "$JS" || { echo "Missing Workout Logging v2 runtime: $JS" >&2; exit 1; }

JS="$JS" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['JS'])
s=p.read_text()
old="""  function protectedProgramLoad(row, card) {
    // A non-empty target load is already authoritative whether it came from a
    // percentage/TM calculation or an explicit fixed prescription.
    if (inputValue(row, '.load-input')) return true
    return PRESCRIBED_PATTERN.test(rowPrescriptionText(row, card))
  }

  function previousActualLoad(card, targetRow) {
    const rows = rowsFor(card)
    const targetIndex = rows.indexOf(targetRow)
    if (targetIndex <= 0) return ''
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (!isDone(row)) continue
      const load = inputValue(row, '.load-input')
      if (load) return load
    }
    return ''
  }

  function carryLoadIfAllowed(card, row) {
    if (!card || !row || protectedProgramLoad(row, card)) return false
    const load = previousActualLoad(card, row)
    if (!load) return false
    const input = row.querySelector('.load-input')
    if (!(input instanceof HTMLInputElement) || input.value.trim()) return false
    input.value = load
    input.dataset.lmfCarriedLoad = 'true'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    markCarryNote(row, load)
    return true
  }"""
new="""  function programmedLoadSignature(row) {
    return String(row?.dataset?.programmedLoad || '').trim()
  }

  function programmedLoadDefault(row) {
    return String(row?.dataset?.programmedLoadDefault || '').trim()
  }

  function previousActualLoad(card, targetRow) {
    const rows = rowsFor(card)
    const targetIndex = rows.indexOf(targetRow)
    if (targetIndex <= 0) return null
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (!isDone(row)) continue
      const load = inputValue(row, '.load-input')
      if (load) return { load, signature: programmedLoadSignature(row) }
    }
    return null
  }

  function targetStillAtProgramDefault(row, input) {
    const current = String(input?.value || '').trim()
    if (!current) return true
    const programmed = programmedLoadDefault(row)
    if (!programmed) return false
    const currentNumber = Number.parseFloat(current)
    const programmedNumber = Number.parseFloat(programmed)
    return Number.isFinite(currentNumber) && Number.isFinite(programmedNumber) && Math.abs(currentNumber - programmedNumber) < 0.001
  }

  function protectedProgramLoad(row, card) {
    // Protect intentional prescription changes, not every prefilled input.
    // A same-prescription next set may inherit the athlete's prior actual load.
    const currentSignature = programmedLoadSignature(row)
    if (currentSignature) return false
    return PRESCRIBED_PATTERN.test(rowPrescriptionText(row, card)) && Boolean(inputValue(row, '.load-input'))
  }

  function carryLoadIfAllowed(card, row) {
    if (!card || !row) return false
    const previous = previousActualLoad(card, row)
    if (!previous?.load) return false
    const input = row.querySelector('.load-input')
    if (!(input instanceof HTMLInputElement)) return false

    const currentSignature = programmedLoadSignature(row)
    if ((currentSignature || previous.signature) && currentSignature !== previous.signature) return false
    if (!targetStillAtProgramDefault(row, input)) return false

    if (input.value.trim() === previous.load) {
      markCarryNote(row, previous.load)
      return true
    }

    input.value = previous.load
    input.dataset.lmfCarriedLoad = 'true'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    markCarryNote(row, previous.load)
    return true
  }"""
if old not in s:
    raise SystemExit('Workout Logging v2 carry patch point missing')
s=s.replace(old,new,1)
p.write_text(s)
PY
node --check "$JS"
grep -Fq "programmedLoadSignature" "$JS"
grep -Fq "targetStillAtProgramDefault" "$JS"
grep -Fq "currentSignature !== previous.signature" "$JS"
echo "Issue #50 Workout Logging load-carry fidelity patch: PASS"
