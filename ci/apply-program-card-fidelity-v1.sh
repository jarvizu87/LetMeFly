#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"
SERVICE="$TARGET/src/services/workout-service.ts"
MAIN="$TARGET/src/main.ts"

for required in "$SERVICE" "$MAIN"; do
  test -s "$required" || { echo "Missing program-card fidelity target: $required" >&2; exit 1; }
done

hash_tree() {
  local dir="$1"
  find "$dir" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

CF_BEFORE="$(hash_tree "$TARGET/src/programs/crownforge")"
CM_BEFORE="$(hash_tree "$TARGET/src/programs/crown-maintenance")"
BC_BEFORE="$(hash_tree "$TARGET/src/programs/black-crown")"

SERVICE="$SERVICE" MAIN="$MAIN" python3 - <<'PY'
from pathlib import Path
import os
import re

service_path = Path(os.environ['SERVICE'])
main_path = Path(os.environ['MAIN'])
service = service_path.read_text()
main = main_path.read_text()

# ---------------------------------------------------------------------------
# Workout source -> history/card bridge. Program packages remain untouched.
# ---------------------------------------------------------------------------
helper_marker = 'async function getVerifiedCrownforgeReferences('
if helper_marker not in service:
    insert_at = service.find('function resolveProgrammedLoad(')
    if insert_at < 0:
        raise SystemExit('resolveProgrammedLoad patch point missing')
    helper = r'''async function getVerifiedCrownforgeReferences(athleteId: string): Promise<Record<string, any>> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['workoutSets'], 'readonly')
    const rows = await requestToPromise<any[]>(tx.objectStore('workoutSets').getAll())
    const accepted = new Set([
      'verified-front-squat-1rm',
      'verified-back-squat-1rm',
      'verified-bench-press-1rm',
      'verified-deadlift-1rm',
      'verified-clean-technical-reference',
      'verified-snatch-technical-reference',
      'current-ohp-working-reference',
    ])
    const latest: Record<string, any> = {}
    for (const row of rows) {
      if (row?.athlete_id !== athleteId || row?.deleted_at || !row?.completed) continue
      const perf = (row.performance_data ?? {}) as Record<string, any>
      const reference = String(perf.loadReference ?? '').trim()
      if (!accepted.has(reference)) continue
      const value = Number(row.load_value)
      if (!Number.isFinite(value) || value <= 0) continue
      const unit = row.load_unit === 'kg' ? 'kg' : 'lb'
      const completedAt = String(row.completed_at ?? row.updated_at ?? '')
      const existing = latest[reference]
      if (!existing || completedAt >= String(existing.completed_at ?? '')) {
        latest[reference] = { tm_value: value, tm_unit: unit, completed_at: completedAt }
      }
    }
    // Crown Maintenance intentionally uses the shorter Clean reference name;
    // Crownforge testing stores the same verified technical result under the
    // explicit technical-reference key. Alias it without rewriting either program.
    if (latest['verified-clean-technical-reference']) {
      latest['verified-clean-reference'] = latest['verified-clean-technical-reference']
    }
    if (latest['verified-snatch-technical-reference']) {
      latest['verified-snatch-reference'] = latest['verified-snatch-technical-reference']
    }
    return latest
  } finally {
    db.close()
  }
}

'''
    service = service[:insert_at] + helper + service[insert_at:]

# Resolve the private reference set appropriate to the active program.
old_maxes = "const trainingMaxes = programKey === 'black-crown' ? await getLatestTrainingMaxes(athleteId) : {}"
new_maxes = "const trainingMaxes = programKey === 'black-crown' ? await getLatestTrainingMaxes(athleteId) : programKey === 'crown-maintenance' ? await getVerifiedCrownforgeReferences(athleteId) : {}"
if old_maxes not in service:
    raise SystemExit('program-aware load reference patch point missing')
service = service.replace(old_maxes, new_maxes, 1)

# Recorded workout history should use the governed version actually being run.
old_version = "program_version: programKey === 'black-crown' ? 'v2.0' : 'v2.1',"
new_version = "program_version: programKey === 'black-crown' ? 'v2.1' : programKey === 'crownforge' ? 'v2.2' : 'v2.1',"
if old_version not in service:
    raise SystemExit('workout program_version patch point missing')
service = service.replace(old_version, new_version, 1)

# Crown Maintenance Day 3 contains a four-movement R1/R2 flow followed by
# independent knee/trunk/aerobic work in the same source section. Do not turn
# that whole mixed section into a giant circuit. Preserve the existing Crownforge
# round heuristic everywhere else to avoid changing governed execution semantics.
old_group = "group_type: section.exercises.length > 1 && section.exercises.filter((candidate) => candidate.sets.some((candidateSet) => /^R\\d+$/i.test(String(candidateSet.label ?? '')))).length > 1 ? 'round' : 'section',"
new_group = "group_type: programKey === 'crown-maintenance' ? (section.exercises.length > 1 && section.exercises.every((candidate) => candidate.sets.length > 0 && candidate.sets.every((candidateSet) => /^R\\d+$/i.test(String(candidateSet.label ?? '')))) ? 'round' : 'section') : (section.exercises.length > 1 && section.exercises.filter((candidate) => candidate.sets.some((candidateSet) => /^R\\d+$/i.test(String(candidateSet.label ?? '')))).length > 1 ? 'round' : 'section'),"
if old_group not in service:
    raise SystemExit('program-aware group_type patch point missing')
service = service.replace(old_group, new_group, 1)

# Preserve source-only prescription details independently from actual performance.
old_notes = "notes: programmed.notes ?? null,\n      percentage: programmed.percentage ?? null,"
new_notes = "notes: programmed.notes ?? null,\n      programmedRpe: (programmed as any).rpe ?? null,\n      programmedSourceText: (programmed as any).sourceText ?? null,\n      percentage: programmed.percentage ?? null,"
if old_notes not in service:
    raise SystemExit('programmed RPE/source-text patch point missing')
service = service.replace(old_notes, new_notes, 1)

# Replace only the resolver body, preserving the existing TypeScript signature.
def replace_function_body(text: str, name: str, body: str) -> str:
    start = text.find(f'function {name}(')
    if start < 0:
        raise SystemExit(f'{name} function not found')
    brace = text.find('{', start)
    if brace < 0:
        raise SystemExit(f'{name} opening brace not found')
    depth = 0
    quote = None
    escaped = False
    i = brace
    while i < len(text):
        ch = text[i]
        if quote:
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == quote:
                quote = None
        else:
            if ch in "'\"`":
                quote = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return text[:brace + 1] + '\n' + body.rstrip() + '\n' + text[i:]
        i += 1
    raise SystemExit(f'{name} closing brace not found')

resolver_body = r'''  if (programmed.loadValue != null) {
    return { value: programmed.loadValue, unit: programmed.loadUnit ?? null, tmKey: null, tmValue: null, tmUnit: null }
  }
  if (typeof programmed.percentage !== 'number' || !programmed.loadReference) {
    return { value: null, unit: null, tmKey: null, tmValue: null, tmUnit: null }
  }

  const rawReference = String(programmed.loadReference)
  const blackCrownPrefix = 'black-crown:tm:'
  const blackCrownKey = rawReference.startsWith(blackCrownPrefix) ? rawReference.slice(blackCrownPrefix.length) : null
  const blackCrownAliases: Record<string, string> = {
    'front-squat': 'front-squat',
    'back-squat': 'back-squat',
    'bench-press': 'bench-press',
    deadlift: 'deadlift',
    'overhead-press': 'overhead-press',
    'power-clean': 'clean',
    'box-squat': 'box-squat',
  }
  const verifiedAliases: Record<string, string> = {
    'verified-clean-reference': 'verified-clean-reference',
    'verified-clean-technical-reference': 'verified-clean-technical-reference',
    'verified-snatch-reference': 'verified-snatch-reference',
    'verified-snatch-technical-reference': 'verified-snatch-technical-reference',
  }
  const tmKey = blackCrownKey ? (blackCrownAliases[blackCrownKey] ?? blackCrownKey) : (verifiedAliases[rawReference] ?? rawReference)
  const tm = trainingMaxes[tmKey]
  if (!tm) return { value: null, unit: null, tmKey, tmValue: null, tmUnit: null }

  const tmValue = Number(tm.tm_value)
  const tmUnit = String(tm.tm_unit ?? 'lb')
  if (!Number.isFinite(tmValue) || tmValue <= 0) {
    return { value: null, unit: null, tmKey, tmValue: null, tmUnit }
  }
  const raw = tmValue * (programmed.percentage > 1 ? programmed.percentage / 100 : programmed.percentage)
  const value = programmed.rounding === 'down-5'
    ? Math.floor(raw / 5) * 5
    : programmed.rounding === 'nearest-5'
      ? Math.round(raw / 5) * 5
      : Math.ceil(raw / 5) * 5
  return { value, unit: tmUnit === 'kg' ? 'kg' : 'lb', tmKey, tmValue, tmUnit }'''
service = replace_function_body(service, 'resolveProgrammedLoad', resolver_body)

# ---------------------------------------------------------------------------
# Card formatting: make the immutable prescription say what the program says.
# ---------------------------------------------------------------------------
summary_marker = 'function workoutPrescriptionSummary('
if summary_marker not in main:
    insert_at = main.find('function setRow(')
    if insert_at < 0:
        raise SystemExit('setRow card patch point missing')
    helper = r'''function workoutPrescriptionSummary(perf: Record<string, any>): string {
  const parts: string[] = []
  const label = String(perf.programmedLabel ?? '').trim()
  if (/\bsets?\b/i.test(label)) parts.push(label)

  let primary = String(perf.distance ?? perf.duration ?? perf.programmedReps ?? '').trim()
  const source = `${String(perf.programmedSourceText ?? '')} ${String(perf.notes ?? '')}`
  if (primary && !/(?:\/side|per side|each side|per leg|each leg|each direction)/i.test(primary)) {
    const nuance = source.match(/\b(each direction|per side|each side|per leg|each leg|per arm|each arm)\b/i)?.[1]
    if (nuance) primary = `${primary} ${nuance}`
  }
  if (primary) parts.push(primary)

  const loadText = String(perf.programmedLoadText ?? '').trim()
  const percentage = Number(perf.percentage)
  if (loadText) parts.push(loadText)
  else if (Number.isFinite(percentage)) parts.push(`${percentage}%`)

  const rpe = String(perf.programmedRpe ?? '').trim()
  if (rpe) parts.push(/^RPE\b/i.test(rpe) ? rpe : `RPE ${rpe}`)
  if (!parts.length && label) parts.push(label)
  return [...new Set(parts)].join(' • ')
}

function programSetPrescriptionSummary(set: any): string {
  return workoutPrescriptionSummary({
    programmedLabel: set.label,
    programmedReps: set.reps,
    programmedLoadText: set.loadText,
    programmedRpe: set.rpe,
    programmedSourceText: set.sourceText,
    percentage: set.percentage,
    distance: set.distance,
    duration: set.duration,
    notes: set.notes,
  })
}

'''
    main = main[:insert_at] + helper + main[insert_at:]

active_variants = [
    "const target = [perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ') || String(perf.programmedLabel ?? '')",
    "const target = [perf.programmedLabel, perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ')",
]
replaced = False
for old in active_variants:
    if old in main:
        main = main.replace(old, "const target = workoutPrescriptionSummary(perf)", 1)
        replaced = True
        break
if not replaced:
    raise SystemExit('active workout prescription summary patch point missing')

old_preview = "${exercise.sets.map((set) => `<div class=\"prescription-row\"><strong>${esc(set.label)}</strong><span>${esc(String(set.reps ?? ''))}${set.loadText ? ` • ${esc(set.loadText)}` : ''}</span></div>`).join('')}"
new_preview = "${exercise.sets.map((set) => `<div class=\"prescription-row\"><strong>${esc(set.label)}</strong><span>${esc(programSetPrescriptionSummary(set) || 'Programmed work')}</span></div>`).join('')}"
if old_preview not in main:
    raise SystemExit('preview workout prescription row patch point missing')
main = main.replace(old_preview, new_preview, 1)

service_path.write_text(service)
main_path.write_text(main)
PY

# Program definitions are immutable; this adapter may only change workout/card translation.
test "$CF_BEFORE" = "$(hash_tree "$TARGET/src/programs/crownforge")"
test "$CM_BEFORE" = "$(hash_tree "$TARGET/src/programs/crown-maintenance")"
test "$BC_BEFORE" = "$(hash_tree "$TARGET/src/programs/black-crown")"

grep -Fq "getVerifiedCrownforgeReferences" "$SERVICE"
grep -Fq "verified-clean-reference" "$SERVICE"
grep -Fq "programKey === 'crown-maintenance' ? await getVerifiedCrownforgeReferences" "$SERVICE"
grep -Fq "programmedRpe" "$SERVICE"
grep -Fq "program_version: programKey === 'black-crown' ? 'v2.1'" "$SERVICE"
grep -Fq "programKey === 'crown-maintenance' ? (section.exercises.length > 1" "$SERVICE"
grep -Fq "workoutPrescriptionSummary" "$MAIN"
grep -Fq "programSetPrescriptionSummary" "$MAIN"
grep -Fq "each direction" "$MAIN"
grep -Fq "RPE" "$MAIN"

echo "LetMeFly Crown Maintenance + Black Crown card fidelity adapter: PASS"
