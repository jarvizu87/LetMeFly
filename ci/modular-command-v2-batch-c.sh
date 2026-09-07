#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" ]]; then
  echo "LetMeFly source tree is missing: $TARGET_DIR" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os

p = Path(os.environ['TARGET_DIR']) / 'src/main.ts'
text = p.read_text()

start_marker = 'function programPage(): string {'
end_marker = '}function progressPageShell(): string {'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('modular Batch C could not locate programPage boundaries')

program_page = '''function programPage(): string {
  const embeddedWeeks = CROWNFORGE.weekData
  const weekCards = CROWNFORGE.weekData.map((week) => {
    const start = week.days[0]?.date ?? ''
    const end = week.days[week.days.length - 1]?.date ?? ''
    const isCurrent = state.selectedProgram === 'crownforge' && week.week === state.selectedWeek
    return `<details class="program-week-drawer" data-program-week-drawer="${week.week}" ${isCurrent ? 'open' : ''}><summary><span>W${week.week}</span><strong>${isCurrent ? 'CURRENT GOVERNED WEEK' : `CROWNFORGE WEEK ${week.week}`}</strong><small>${esc(start)}–${esc(end.slice(5))}</small></summary><section id="program-week-${week.week}" class="program-week ${isCurrent ? 'active' : ''}"><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${isCurrent && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="crownforge"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section></details>`
  }).join('')

  const maintenanceCards = CROWN_MAINTENANCE.weekData.map((week) => {
    const start = week.days[0]?.date ?? ''
    const end = week.days[week.days.length - 1]?.date ?? ''
    const isCurrent = state.selectedProgram === 'crown-maintenance' && week.week === state.selectedWeek
    return `<details class="program-week-drawer maintenance-drawer" data-maintenance-week-drawer="${week.week}" ${isCurrent ? 'open' : ''}><summary><span>M${week.week}</span><strong>${isCurrent ? 'CURRENT BRIDGE WEEK' : `CROWN MAINTENANCE ${week.week}`}</strong><small>${esc(start)}–${esc(end.slice(5))}</small></summary><section id="maintenance-week-${week.week}" class="program-week ${isCurrent ? 'active' : ''}"><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${isCurrent && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="crown-maintenance"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section></details>`
  }).join('')

  const embeddedPercent = Math.min(100, Math.round((embeddedWeeks.length / 14) * 100))
  return `<div class="page-head cinematic-head program-page-head"><div class="page-kicker">Program intelligence</div><h1>PROGRAM</h1><p class="muted">Current governed training first. Long-term development remains visible without inventing source detail.</p></div>
    <section class="program-hero card"><div><span class="program-chip active">CURRENT PROGRAM</span><h2>${esc(CROWNFORGE.name)}</h2><p>${esc(CROWNFORGE.description)}</p><div class="hero-tags"><span>WEEK ${state.selectedWeek}</span><span>DAY ${state.selectedDay}</span><span>WEEKS 1–14 VERIFIED</span></div></div><div class="program-progress"><span>VERIFIED STRUCTURE</span><strong>${embeddedWeeks.length}/14 WEEKS</strong><div class="progress-bar"><span style="width:${embeddedPercent}%"></span></div></div></section>
    <div class="section-title roadmap-title"><div><div class="page-kicker">Long-term strength & athletic development</div><h2>BLACK CROWN</h2></div><span class="badge optional">ROADMAP</span></div>
    <section class="black-crown-panel v2-roadmap-priority">
      <div class="black-crown-copy"><div class="crown-seal">♛</div><h2>${esc(BLACK_CROWN.name)}</h2><p>${esc(BLACK_CROWN.description)}</p><div class="source-note">Phase architecture is visible now. Detailed sessions stay source-gated until imported and audited.</div></div>
      <div class="black-crown-phases">
        <div class="bc-phase foundation"><span>01</span><div><strong>FOUNDATION</strong><small>Weeks 1–12 • Build the base.</small></div></div>
        <div class="bc-phase volume"><span>02</span><div><strong>VOLUME</strong><small>Weeks 13–24 • Add capacity.</small></div></div>
        <div class="bc-phase intensity"><span>03</span><div><strong>INTENSIFICATION</strong><small>Weeks 25–36 • Raise the ceiling.</small></div></div>
        <div class="bc-phase realization"><span>04</span><div><strong>REALIZATION</strong><small>Weeks 37–52+ • Become more.</small></div></div>
      </div>
    </section>
    <div class="program-current-week-label"><div><div class="page-kicker">Governed Crownforge detail</div><h2>VERIFIED WEEKS</h2></div><span>Tap a week to inspect it</span></div>
    <nav class="program-week-nav" aria-label="Embedded Crownforge weeks"><span>JUMP TO</span>${embeddedWeeks.map((week) => `<button class="${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    <div class="program-weeks-compact">${weekCards}</div>
    <div class="section-title"><div><div class="page-kicker">Mandatory handoff</div><h2>CROWN MAINTENANCE</h2><p class="muted">Three governed bridge weeks after testing and before Black Crown Week 1.</p></div><span class="badge mandatory">3 weeks embedded</span></div>
    <section class="program-hero card"><div><span class="program-chip active">ENTRY BRIDGE</span><h2>${esc(CROWN_MAINTENANCE.name)}</h2><p>${esc(CROWN_MAINTENANCE.description)}</p><div class="hero-tags"><span>POST-TEST</span><span>STRENGTH RETENTION</span><span>ACTIVATION</span></div></div><div class="program-progress"><span>EMBEDDED SOURCE</span><strong>3/3 WEEKS</strong><div class="progress-bar"><span style="width:100%"></span></div></div></section>
    <div class="program-weeks-compact maintenance-weeks-compact">${maintenanceCards}</div>
    <details class="source-details"><summary>Source governance notes</summary>${CROWNFORGE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${CROWN_MAINTENANCE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${BLACK_CROWN.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}</details>`
'''
text = text[:start] + program_page + text[end:]

replacements = [
('''}function progressPageShell(): string {
  return `<div class="page-head cinematic-head"><div class="page-kicker">Athlete-owned history</div><h1>PROGRESS</h1><p class="muted">Strength, work, and consistency without rewriting completed history.</p></div><div id="progress-content"><div class="card loading-card">Loading your history…</div></div>`
''', '''}function progressPageShell(): string {
  return `<div class="page-head cinematic-head progress-page-head"><div class="page-kicker">Analytics & metrics</div><h1>PROGRESS</h1><p class="muted">Private training history turned into useful signal without rewriting completed work.</p></div><div id="progress-content"><div class="card loading-card">Loading your history…</div></div>`
'''),
('''  const workouts = await recentWorkoutSessions(state.athlete.id, 8)
  const lifts = [
''', '''  const workouts = await recentWorkoutSessions(state.athlete.id, 8)
  const bodyweights = (await getAll('bodyweightEntries')).filter((row) => row.athlete_id === state.athlete?.id).sort((a,b) => String(b.recorded_at ?? '').localeCompare(String(a.recorded_at ?? '')))
  const prs = (await getAll('personalRecords')).filter((row) => row.athlete_id === state.athlete?.id)
  const lifts = [
'''),
('''  const savedTms = lifts.map(([key,name]) => ({ key, name, row: tms[key] })).filter((x) => x.row)
  target.innerHTML = `<div class="progress-score-grid">
      <div class="score-card hero-score"><span>WORKOUTS LOGGED</span><strong>${workouts.length}</strong><small>Recent history window</small></div>
      <div class="score-card"><span>TRAINING MAXES</span><strong>${savedTms.length}</strong><small>Current lift records</small></div>
      <div class="score-card"><span>PROGRAM</span><strong>CROWNFORGE</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>
    </div>
    <div class="v2-analytics">
''', '''  const savedTms = lifts.map(([key,name]) => ({ key, name, row: tms[key] })).filter((x) => x.row)
  const bodyweight = bodyweights[0]
  const bwValue = bodyweight ? Number(bodyweight.bodyweight_value ?? bodyweight.weight_value ?? 0) : 0
  const bwUnit = String(bodyweight?.bodyweight_unit ?? bodyweight?.weight_unit ?? state.athlete.default_weight_unit ?? 'lb')
  const strengthCards = lifts.slice(0,4).map(([key,name]) => {
    const row = tms[key]
    const value = Number(row?.tm_value ?? 0)
    return `<div class="strength-metric"><span>${esc(name)}</span><strong>${value ? esc(String(value)) : '—'}<small>${value ? ` ${esc(String(row?.tm_unit ?? 'lb'))}` : ''}</small></strong><i style="--strength:${value ? Math.max(12, Math.min(100, value / 4.5)) : 8}%"></i></div>`
  }).join('')
  target.innerHTML = `<div class="progress-score-grid command-metrics">
      <div class="score-card hero-score"><span>SESSIONS</span><strong>${workouts.length}</strong><small>Recent history window</small></div>
      <div class="score-card"><span>TRAINING MAXES</span><strong>${savedTms.length}</strong><small>Current lift records</small></div>
      <div class="score-card"><span>BODYWEIGHT</span><strong>${bwValue ? `${esc(String(bwValue))} ${esc(bwUnit)}` : '—'}</strong><small>${bwValue ? 'Latest private entry' : 'No entry yet'}</small></div>
      <div class="score-card"><span>PRS</span><strong>${prs.length}</strong><small>Detected private records</small></div>
    </div>
    <section class="card strength-progress-card"><div class="v2-chart-title"><div><span>STRENGTH PROFILE</span><strong>Current training maxes</strong></div><span>${savedTms.length} tracked</span></div><div class="strength-metric-grid">${strengthCards}</div></section>
    <div class="v2-analytics">
'''),
('''      <section class="v2-chart"><div class="v2-chart-title"><div><span>STRENGTH SNAPSHOT</span><strong>${savedTms.length ? `${savedTms.length} tracked lifts` : 'Build the trend'}</strong></div><span>Current TM profile</span></div><div class="v2-bars">${lifts.map(([key], index) => { const value = Number(tms[key]?.tm_value ?? 0); const scaled = value > 0 ? Math.max(12, Math.min(100, value / 4.5)) : 8 + index * 3; return `<i style="height:${scaled}%"></i>` }).join('')}</div></section>
''', '''      <section class="v2-chart"><div class="v2-chart-title"><div><span>TM SNAPSHOT</span><strong>${savedTms.length ? `${savedTms.length} tracked lifts` : 'Build the profile'}</strong></div><span>Relative visual scale</span></div><div class="v2-bars">${lifts.map(([key], index) => { const value = Number(tms[key]?.tm_value ?? 0); const scaled = value > 0 ? Math.max(12, Math.min(100, value / 4.5)) : 8 + index * 3; return `<i style="height:${scaled}%"></i>` }).join('')}</div></section>
'''),
('''<span class="badge mandatory">Private</span>''', '''<span class="badge mandatory">PRIVATE</span>'''),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'modular Batch C expected one source block, found {count}: {old[:80]!r}')
    text = text.replace(old, new, 1)

p.write_text(text)
PY

grep -Fq 'program-page-head' "$TARGET_DIR/src/main.ts"
grep -Fq 'WEEKS 1–14 VERIFIED' "$TARGET_DIR/src/main.ts"
grep -Fq 'program-week-drawer' "$TARGET_DIR/src/main.ts"
grep -Fq 'maintenance-drawer' "$TARGET_DIR/src/main.ts"
grep -Fq 'v2-roadmap-priority' "$TARGET_DIR/src/main.ts"
grep -Fq 'strength-progress-card' "$TARGET_DIR/src/main.ts"
grep -Fq "getAll('bodyweightEntries')" "$TARGET_DIR/src/main.ts"
grep -Fq "getAll('personalRecords')" "$TARGET_DIR/src/main.ts"

echo "Command V2 modular Program/Progress adapter: PASS"
