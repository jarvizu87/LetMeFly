#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
test -s "$MAIN" || { echo "Missing generated main source: $MAIN" >&2; exit 1; }

MAIN="$MAIN" python3 - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['MAIN'])
text = p.read_text()
start = text.find('function workoutMetricMeta(')
end = text.find('function programPage()', start)
if start < 0 or end < 0:
    raise SystemExit('Issue #50 generated set-row block not found')

block = r'''function workoutMetricMeta(perf: Record<string, any>): { kind: 'reps' | 'distance' | 'duration'; unit: string; label: string } {
  const explicitDistance = String(perf.distance ?? '').trim()
  const explicitDuration = String(perf.duration ?? '').trim()
  const programmed = String(perf.programmedReps ?? '').trim()
  const value = explicitDistance || explicitDuration || programmed
  if (explicitDistance || /(?:^|\s)\d+(?:\s*[–-]\s*\d+)?\s*(?:m|meters?|metres?|yd|yards?|ft|feet)\b/i.test(value)) {
    const unit = /(?:yd|yard)/i.test(value) ? 'yd' : /(?:ft|feet)/i.test(value) ? 'ft' : 'm'
    return { kind: 'distance', unit, label: `Distance (${unit})` }
  }
  if (explicitDuration || /\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(value)) {
    const unit = /\b(?:hr|hrs|hour|hours)\b/i.test(value) ? 'hr' : /\b(?:min|mins|minute|minutes)\b/i.test(value) ? 'min' : 'sec'
    return { kind: 'duration', unit, label: `Time (${unit})` }
  }
  return { kind: 'reps', unit: 'reps', label: 'Reps' }
}

function programmedLoadSignature(perf: Record<string, any>): string {
  const explicit = perf.programmedLoadValue != null ? `${perf.programmedLoadValue}:${perf.programmedLoadUnit ?? ''}` : ''
  return explicit || String(perf.programmedLoadText ?? perf.resolvedLoadValue ?? '').trim()
}

function setRow(set: LocalDomainRecord): string {
  const perf = (set.performance_data ?? {}) as Record<string, any>
  const target = [perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ') || String(perf.programmedLabel ?? '')
  const metric = workoutMetricMeta(perf)
  const reps = set.reps ?? (typeof perf.programmedReps === 'number' ? perf.programmedReps : '')
  const metricValue = perf.actualMetricValue ?? ''
  const primaryValue = metric.kind === 'reps' ? reps : metricValue
  const primaryClass = metric.kind === 'reps' ? 'reps-input' : 'metric-input'
  const load = set.load_value ?? ''
  const rpe = set.rpe ?? ''
  const plate = typeof load === 'number' && set.load_unit === 'lb' ? formatPlates(calculatePlates(load)) : ''
  const loadSignature = programmedLoadSignature(perf)
  const loadDefault = perf.programmedLoadValue ?? perf.resolvedLoadValue ?? ''
  const hasProgrammedLoad = Boolean(loadSignature || load !== '')
  return `<div class="set-row" data-set-id="${esc(set.id)}" data-prescription-kind="${metric.kind}" data-metric-unit="${esc(metric.unit)}" data-programmed-load="${esc(loadSignature)}" data-programmed-load-default="${esc(String(loadDefault))}" data-has-load="${hasProgrammedLoad ? 'true' : 'false'}"><div class="set-label"><span>SET</span><strong>${esc(String(set.set_number))}</strong></div><div class="set-target-cell lmf-prescription-cell"><span>Prescription</span><strong>${esc(target || 'Programmed work')}</strong></div><div class="set-field reps-field ${metric.kind === 'reps' ? '' : 'lmf-metric-field'}"><label>${esc(metric.label)}</label><input class="set-input ${primaryClass}" inputmode="decimal" value="${esc(String(primaryValue))}"></div><div class="set-field load-field"><label>Load</label><input class="set-input load-input" inputmode="decimal" value="${esc(String(load))}"><small>${esc(plate)}</small></div><div class="set-field rpe-field"><label>RPE</label><input class="set-input rpe-input" inputmode="decimal" value="${esc(String(rpe))}"></div><button class="set-check ${set.completed ? 'done' : ''}" data-action="toggle-set">${set.completed ? '✓' : '○'}</button></div>`
}

'''
text = text[:start] + block + text[end:]
p.write_text(text)
PY

grep -Fq "function workoutMetricMeta" "$MAIN"
grep -Fq "data-prescription-kind" "$MAIN"
grep -Fq "Distance (\${unit})" "$MAIN"
! grep -Fq '\\nfunction programmedLoadSignature' "$MAIN"
echo "Issue #50 generated workout metric source normalized: PASS"
