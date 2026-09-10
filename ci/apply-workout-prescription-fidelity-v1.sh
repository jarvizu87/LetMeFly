#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?target app root required}"
MAIN="$TARGET/src/main.ts"
SERVICE="$TARGET/src/services/workout-service.ts"
FLOW="$TARGET/public/ui/workout-flow-v1.js"
CSS="$TARGET/src/command-v2.css"

for f in "$MAIN" "$SERVICE" "$FLOW" "$CSS"; do
  test -s "$f" || { echo "Missing workout fidelity target: $f" >&2; exit 1; }
done

MAIN="$MAIN" SERVICE="$SERVICE" FLOW="$FLOW" python3 - <<'PY'
from pathlib import Path
import os

main_path = Path(os.environ['MAIN'])
service_path = Path(os.environ['SERVICE'])
flow_path = Path(os.environ['FLOW'])

main = main_path.read_text()
service = service_path.read_text()
flow = flow_path.read_text()

# Structured round metadata survives workout creation.
old_group = """            group_key: section.id,\n            group_type: 'section',\n            prescription_snapshot: {"""
new_group = """            group_key: section.id,\n            group_type: section.exercises.length > 1 && section.exercises.filter((candidate) => candidate.sets.some((candidateSet) => /^R\\d+$/i.test(String(candidateSet.label ?? '')))).length > 1 ? 'round' : 'section',\n            prescription_snapshot: {"""
if old_group not in service:
    raise SystemExit('workout-service group_type patch point missing')
service = service.replace(old_group, new_group, 1)

# Preserve an immutable per-set prescription signature for safe load carry-forward.
old_perf = """      programmedLoadText: programmed.loadText ?? null,\n      duration: programmed.duration ?? null,"""
new_perf = """      programmedLoadText: programmed.loadText ?? null,\n      programmedLoadValue: programmed.loadValue ?? null,\n      programmedLoadUnit: programmed.loadUnit ?? null,\n      duration: programmed.duration ?? null,"""
if old_perf not in service:
    raise SystemExit('workout-service performance_data patch point missing')
service = service.replace(old_perf, new_perf, 1)

old_log_sig = """  values: { reps?: number | null; loadValue?: number | null; loadUnit?: 'lb' | 'kg' | null; rpe?: number | null; rir?: number | null; notes?: string | null },"""
new_log_sig = """  values: { reps?: number | null; loadValue?: number | null; loadUnit?: 'lb' | 'kg' | null; rpe?: number | null; rir?: number | null; notes?: string | null; metricKind?: string | null; metricValue?: number | null; metricUnit?: string | null },"""
if old_log_sig not in service:
    raise SystemExit('workout-service logSet signature patch point missing')
service = service.replace(old_log_sig, new_log_sig, 1)

old_notes = """      notes: values.notes ?? existing.notes ?? null,\n      completed: true,"""
new_notes = """      notes: values.notes ?? existing.notes ?? null,\n      performance_data: values.metricKind\n        ? {\n            ...((existing.performance_data ?? {}) as Record<string, any>),\n            actualMetricKind: values.metricKind,\n            actualMetricValue: values.metricValue ?? null,\n            actualMetricUnit: values.metricUnit ?? null,\n          }\n        : existing.performance_data,\n      completed: true,"""
if old_notes not in service:
    raise SystemExit('workout-service metric persistence patch point missing')
service = service.replace(old_notes, new_notes, 1)

# Render persisted group type into Workout Mode.
old_swipe = """function workoutSwipePages(day: ProgramDay, workout: WorkoutBundle): string {\n  const bySection = new Map<string, typeof workout.exercises>()\n  for (const item of workout.exercises) {\n    const key = String(item.record.group_key ?? 'other')\n    if (!bySection.has(key)) bySection.set(key, [])\n    bySection.get(key)!.push(item)\n  }\n  const stats = completionStats(workout)\n  return `\n    ${readinessPage(day, true)}\n    ${day.sections.map((section, index) => `<section class=\"swipe-page workout-panel\"><div class=\"workout-panel-head\"><div><div class=\"page-kicker\">${String.fromCharCode(65 + index)} • Workout Section</div><h2>${esc(section.title)}</h2>${section.subtitle ? `<p class=\"muted\">${esc(section.subtitle)}</p>` : ''}</div><span class=\"section-number\">${index + 1}/${day.sections.length}</span></div><div class=\"exercise-stack\">${(bySection.get(section.id) ?? []).map((item) => loggedExerciseCard(item.record, item.sets)).join('') || '<div class=\"empty\">No loggable work in this section.</div>'}</div></section>`).join('')}\n    <section class=\"swipe-page workout-panel review-panel\"><div class=\"review-mark\">♛</div><div class=\"page-kicker\">Session Review</div><h2>${stats.done} / ${stats.total} sets logged</h2><div class=\"progress-bar large\"><span style=\"width:${stats.percent}%\"></span></div><p class=\"muted\">History records what actually happened. Program updates never rewrite this session.</p><div class=\"btn-row\"><button class=\"btn primary hero-start\" data-action=\"complete-workout\" ${workout.session.status === 'completed' ? 'disabled' : ''}>${workout.session.status === 'completed' ? 'WORKOUT COMPLETE' : 'COMPLETE WORKOUT'}</button><button class=\"btn ghost\" data-action=\"sync-now\">Sync Now</button></div></section>\n  `\n}"""
new_swipe = """function workoutSwipePages(day: ProgramDay, workout: WorkoutBundle): string {\n  const bySection = new Map<string, typeof workout.exercises>()\n  for (const item of workout.exercises) {\n    const key = String(item.record.group_key ?? 'other')\n    if (!bySection.has(key)) bySection.set(key, [])\n    bySection.get(key)!.push(item)\n  }\n  const stats = completionStats(workout)\n  return `\n    ${readinessPage(day, true)}\n    ${day.sections.map((section, index) => {\n      const items = bySection.get(section.id) ?? []\n      const groupType = String(items[0]?.record.group_type ?? 'section')\n      return `<section class=\"swipe-page workout-panel\" data-group-type=\"${esc(groupType)}\"><div class=\"workout-panel-head\"><div><div class=\"page-kicker\">${String.fromCharCode(65 + index)} • Workout Section</div><h2>${esc(section.title)}</h2>${section.subtitle ? `<p class=\"muted\">${esc(section.subtitle)}</p>` : ''}</div><span class=\"section-number\">${index + 1}/${day.sections.length}</span></div><div class=\"exercise-stack\">${items.map((item) => loggedExerciseCard(item.record, item.sets)).join('') || '<div class=\"empty\">No loggable work in this section.</div>'}</div></section>`\n    }).join('')}\n    <section class=\"swipe-page workout-panel review-panel\"><div class=\"review-mark\">♛</div><div class=\"page-kicker\">Session Review</div><h2>${stats.done} / ${stats.total} sets logged</h2><div class=\"progress-bar large\"><span style=\"width:${stats.percent}%\"></span></div><p class=\"muted\">History records what actually happened. Program updates never rewrite this session.</p><div class=\"btn-row\"><button class=\"btn primary hero-start\" data-action=\"complete-workout\" ${workout.session.status === 'completed' ? 'disabled' : ''}>${workout.session.status === 'completed' ? 'WORKOUT COMPLETE' : 'COMPLETE WORKOUT'}</button><button class=\"btn ghost\" data-action=\"sync-now\">Sync Now</button></div></section>\n  `\n}"""
if old_swipe not in main:
    raise SystemExit('main workoutSwipePages patch point missing')
main = main.replace(old_swipe, new_swipe, 1)

old_setrow = """function setRow(set: LocalDomainRecord): string {\n  const perf = (set.performance_data ?? {}) as Record<string, any>\n  const target = [perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ') || String(perf.programmedLabel ?? '')\n  const reps = set.reps ?? (typeof perf.programmedReps === 'number' ? perf.programmedReps : '')\n  const load = set.load_value ?? ''\n  const rpe = set.rpe ?? ''\n  const plate = typeof load === 'number' && set.load_unit === 'lb' ? formatPlates(calculatePlates(load)) : ''\n  return `<div class=\"set-row\" data-set-id=\"${esc(set.id)}\"><div class=\"set-label\"><span>SET</span><strong>${esc(String(set.set_number))}</strong></div><div class=\"set-target-cell\"><span>Target</span><strong>${esc(target)}</strong></div><div class=\"set-field reps-field\"><label>Reps</label><input class=\"set-input reps-input\" inputmode=\"numeric\" value=\"${esc(String(reps))}\"></div><div class=\"set-field load-field\"><label>Load</label><input class=\"set-input load-input\" inputmode=\"decimal\" value=\"${esc(String(load))}\"><small>${esc(plate)}</small></div><div class=\"set-field rpe-field\"><label>RPE</label><input class=\"set-input rpe-input\" inputmode=\"decimal\" value=\"${esc(String(rpe))}\"></div><button class=\"set-check ${set.completed ? 'done' : ''}\" data-action=\"toggle-set\">${set.completed ? '✓' : '○'}</button></div>`\n}"""
new_setrow = r"""function workoutMetricMeta(perf: Record<string, any>): { kind: 'reps' | 'distance' | 'duration'; unit: string; label: string } {\n  const explicitDistance = String(perf.distance ?? '').trim()\n  const explicitDuration = String(perf.duration ?? '').trim()\n  const programmed = String(perf.programmedReps ?? '').trim()\n  const value = explicitDistance || explicitDuration || programmed\n  if (explicitDistance || /(?:^|\\s)\\d+(?:\\s*[–-]\\s*\\d+)?\\s*(?:m|meter|meters|metre|metres|yd|yard|yards|ft|feet)(?:\\b|\\/)/i.test(value)) {\n    const unit = /(?:yd|yard)/i.test(value) ? 'yd' : /(?:ft|feet)/i.test(value) ? 'ft' : 'm'\n    return { kind: 'distance', unit, label: `Distance (${unit})` }\n  }\n  if (explicitDuration || /\\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\\b/i.test(value)) {\n    const unit = /\\b(?:hr|hrs|hour|hours)\\b/i.test(value) ? 'hr' : /\\b(?:min|mins|minute|minutes)\\b/i.test(value) ? 'min' : 'sec'\n    return { kind: 'duration', unit, label: `Time (${unit})` }\n  }\n  return { kind: 'reps', unit: 'reps', label: 'Reps' }\n}\n\nfunction programmedLoadSignature(perf: Record<string, any>): string {\n  const explicit = perf.programmedLoadValue != null ? `${perf.programmedLoadValue}:${perf.programmedLoadUnit ?? ''}` : ''\n  return explicit || String(perf.programmedLoadText ?? perf.resolvedLoadValue ?? '').trim()\n}\n\nfunction setRow(set: LocalDomainRecord): string {\n  const perf = (set.performance_data ?? {}) as Record<string, any>\n  const target = [perf.programmedLabel, perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ')\n  const metric = workoutMetricMeta(perf)\n  const reps = set.reps ?? (typeof perf.programmedReps === 'number' ? perf.programmedReps : '')\n  const metricValue = perf.actualMetricValue ?? ''\n  const primaryValue = metric.kind === 'reps' ? reps : metricValue\n  const primaryClass = metric.kind === 'reps' ? 'reps-input' : 'metric-input'\n  const load = set.load_value ?? ''\n  const rpe = set.rpe ?? ''\n  const plate = typeof load === 'number' && set.load_unit === 'lb' ? formatPlates(calculatePlates(load)) : ''\n  const loadSignature = programmedLoadSignature(perf)\n  const loadDefault = perf.programmedLoadValue ?? perf.resolvedLoadValue ?? ''\n  const hasProgrammedLoad = Boolean(loadSignature || load !== '')\n  return `<div class=\"set-row\" data-set-id=\"${esc(set.id)}\" data-prescription-kind=\"${metric.kind}\" data-metric-unit=\"${esc(metric.unit)}\" data-programmed-load=\"${esc(loadSignature)}\" data-programmed-load-default=\"${esc(String(loadDefault))}\" data-has-load=\"${hasProgrammedLoad ? 'true' : 'false'}\"><div class=\"set-label\"><span>SET</span><strong>${esc(String(set.set_number))}</strong></div><div class=\"set-target-cell lmf-prescription-cell\"><span>Prescription</span><strong>${esc(target || 'Programmed work')}</strong></div><div class=\"set-field reps-field ${metric.kind === 'reps' ? '' : 'lmf-metric-field'}\"><label>${esc(metric.label)}</label><input class=\"set-input ${primaryClass}\" inputmode=\"decimal\" value=\"${esc(String(primaryValue))}\"></div><div class=\"set-field load-field\"><label>Load</label><input class=\"set-input load-input\" inputmode=\"decimal\" value=\"${esc(String(load))}\"><small>${esc(plate)}</small></div><div class=\"set-field rpe-field\"><label>RPE</label><input class=\"set-input rpe-input\" inputmode=\"decimal\" value=\"${esc(String(rpe))}\"></div><button class=\"set-check ${set.completed ? 'done' : ''}\" data-action=\"toggle-set\">${set.completed ? '✓' : '○'}</button></div>`\n}""".replace('\\n','\n')
if old_setrow not in main:
    raise SystemExit('main setRow patch point missing')
main = main.replace(old_setrow, new_setrow, 1)

old_toggle = """    const repsRaw = row.querySelector<HTMLInputElement>('.reps-input')?.value ?? ''\n    const loadRaw = row.querySelector<HTMLInputElement>('.load-input')?.value ?? ''\n    const rpeRaw = row.querySelector<HTMLInputElement>('.rpe-input')?.value ?? ''\n    await logSet(state.athlete.id, setId, {\n      reps: repsRaw === '' ? null : Number(repsRaw),\n      loadValue: loadRaw === '' ? null : Number(loadRaw),\n      loadUnit: loadRaw === '' ? null : 'lb',\n      rpe: rpeRaw === '' ? null : Number(rpeRaw),\n    })"""
new_toggle = """    const repsRaw = row.querySelector<HTMLInputElement>('.reps-input')?.value ?? ''\n    const metricRaw = row.querySelector<HTMLInputElement>('.metric-input')?.value ?? ''\n    const metricKind = row.dataset.prescriptionKind ?? 'reps'\n    const metricUnit = row.dataset.metricUnit ?? ''\n    const loadRaw = row.querySelector<HTMLInputElement>('.load-input')?.value ?? ''\n    const rpeRaw = row.querySelector<HTMLInputElement>('.rpe-input')?.value ?? ''\n    await logSet(state.athlete.id, setId, {\n      reps: repsRaw === '' ? null : Number(repsRaw),\n      loadValue: loadRaw === '' ? null : Number(loadRaw),\n      loadUnit: loadRaw === '' ? null : 'lb',\n      rpe: rpeRaw === '' ? null : Number(rpeRaw),\n      metricKind: metricKind === 'reps' ? null : metricKind,\n      metricValue: metricRaw === '' ? null : Number(metricRaw),\n      metricUnit: metricKind === 'reps' ? null : metricUnit,\n    })"""
if old_toggle not in main:
    raise SystemExit('main toggle-set metric patch point missing')
main = main.replace(old_toggle, new_toggle, 1)

# Flow runtime prefers structured group metadata and the immutable prescription display.
old_group_kind = """  function groupKind(panel) {\n    const title = text(panel.querySelector('.workout-panel-head h2'))\n    const subtitle = text(panel.querySelector('.workout-panel-head .muted'))\n    const combined = `${title} ${subtitle}`\n    if (!GROUP_PATTERN.test(combined)) return 'sequential'\n    if (/superset/i.test(combined)) return 'superset'\n    if (/tri[- ]?set/i.test(combined)) return 'tri-set'\n    if (/giant set/i.test(combined)) return 'giant-set'\n    return 'circuit'\n  }"""
new_group_kind = """  function groupKind(panel) {\n    const structured = String(panel?.dataset?.groupType || '').toLowerCase()\n    if (structured === 'round' || structured === 'circuit') return 'circuit'\n    if (structured === 'superset') return 'superset'\n    if (structured === 'tri-set') return 'tri-set'\n    if (structured === 'giant-set') return 'giant-set'\n\n    // Backward compatibility for workout sessions created before structured group_type.\n    const title = text(panel.querySelector('.workout-panel-head h2'))\n    const subtitle = text(panel.querySelector('.workout-panel-head .muted'))\n    const combined = `${title} ${subtitle}`\n    if (!GROUP_PATTERN.test(combined)) return 'sequential'\n    if (/superset/i.test(combined)) return 'superset'\n    if (/tri[- ]?set/i.test(combined)) return 'tri-set'\n    if (/giant set/i.test(combined)) return 'giant-set'\n    return 'circuit'\n  }"""
if old_group_kind not in flow:
    raise SystemExit('workout-flow groupKind patch point missing')
flow = flow.replace(old_group_kind, new_group_kind, 1)

old_prescription = """  function prescriptionFor(row) {\n    if (!row) return ''\n    const reps = formatInputValue(row, '.reps-input')\n    const load = formatInputValue(row, '.load-input')\n    const pieces = []\n    if (reps) pieces.push(`${reps} reps`)\n    if (load) pieces.push(`${load} lb`)\n    return pieces.join(' • ')\n  }"""
new_prescription = """  function prescriptionFor(row) {\n    if (!row) return ''\n    const programmed = text(row.querySelector('.lmf-prescription-cell strong'))\n    if (programmed) return programmed\n    const metric = formatInputValue(row, '.metric-input')\n    const metricUnit = row?.dataset?.metricUnit || ''\n    const reps = formatInputValue(row, '.reps-input')\n    const load = formatInputValue(row, '.load-input')\n    const pieces = []\n    if (metric) pieces.push(`${metric}${metricUnit ? ` ${metricUnit}` : ''}`)\n    else if (reps) pieces.push(`${reps} reps`)\n    if (load) pieces.push(`${load} lb`)\n    return pieces.join(' • ')\n  }"""
if old_prescription not in flow:
    raise SystemExit('workout-flow prescriptionFor patch point missing')
flow = flow.replace(old_prescription, new_prescription, 1)

main_path.write_text(main)
service_path.write_text(service)
flow_path.write_text(flow)
PY

cat >> "$CSS" <<'CSS'

/* Issue #50 — prescription fidelity + metric-aware logging. */
.lmf-workout-flow-card .lmf-prescription-cell{display:block!important}
.lmf-workout-flow-card .lmf-prescription-cell strong{color:#eef3f8!important;font-size:11px!important;line-height:1.35!important}
.lmf-workout-flow-card .lmf-metric-field label{color:#c7b7ff!important}
.lmf-workout-flow-card .set-row[data-has-load="false"] .load-field{opacity:.45}
@media(max-width:680px){.lmf-workout-flow-card .set-target-cell.lmf-prescription-cell{display:block!important}}
CSS

grep -Fq "data-group-type" "$MAIN"
grep -Fq "data-prescription-kind" "$MAIN"
grep -Fq "actualMetricKind" "$SERVICE"
grep -Fq "programmedLoadValue" "$SERVICE"
grep -Fq "structured === 'round'" "$FLOW"
grep -Fq "lmf-prescription-cell" "$CSS"

echo "Issue #50 workout prescription fidelity source patch: PASS"
