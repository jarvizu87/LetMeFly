#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || ! -f "$TARGET_DIR/src/main.ts" ]]; then
  echo "Usage: $0 <letmefly_app_source_dir>" >&2
  exit 1
fi

TARGET_DIR="$TARGET_DIR" python - <<'PY'
from pathlib import Path
import os
import re

p = Path(os.environ['TARGET_DIR']) / 'src/main.ts'
text = p.read_text()

# Replace the legacy Black Crown roadmap-only Program view with governed v2.0
# browsing while preserving the verified Crownforge and Maintenance sections.
start = text.find('function programPage(): string {')
end = text.find('}function progressPageShell(): string {', start)
if start < 0 or end < 0:
    raise SystemExit('Black Crown UI could not locate programPage boundaries')

program_page = r'''function programPage(): string {
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

  const blackCrownCards = BLACK_CROWN.weekData.map((week) => {
    const block = BLACK_CROWN_BLOCKS.find((item) => week.week >= item.startWeek && week.week <= item.endWeek)
    const blockNumber = block ? BLACK_CROWN_BLOCKS.indexOf(block) + 1 : Math.ceil(week.week / 6)
    const isCurrent = state.selectedProgram === 'black-crown' && week.week === state.selectedWeek
    return `<details class="program-week-drawer black-crown-drawer" data-black-crown-week-drawer="${week.week}" ${isCurrent ? 'open' : ''}><summary><span>W${week.week}</span><strong>${isCurrent ? 'CURRENT BLACK CROWN WEEK' : `BLACK CROWN WEEK ${week.week}`}</strong><small>B${blockNumber} • ${esc(block?.title ?? week.intent)}</small></summary><section id="black-crown-week-${week.week}" class="program-week ${isCurrent ? 'active' : ''}"><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${isCurrent && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="black-crown"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section></details>`
  }).join('')

  const embeddedPercent = Math.min(100, Math.round((embeddedWeeks.length / 14) * 100))
  const blackCrownRoadmap = BLACK_CROWN_BLOCKS.map((block, index) => {
    const phaseClass = index < 2 ? 'foundation' : index < 4 ? 'volume' : index < 6 ? 'intensity' : 'realization'
    return `<div class="bc-phase ${phaseClass}"><span>${String(index + 1).padStart(2,'0')}</span><div><strong>${esc(block.title.toUpperCase())}</strong><small>Weeks ${block.startWeek}–${block.endWeek}</small></div></div>`
  }).join('')

  return `<div class="page-head cinematic-head program-page-head"><div class="page-kicker">Program intelligence</div><h1>PROGRAM</h1><p class="muted">Governed program definitions stay separate from workout history and private athlete data.</p></div>
    <section class="program-hero card"><div><span class="program-chip active">CURRENT PROGRAM</span><h2>${esc(CROWNFORGE.name)}</h2><p>${esc(CROWNFORGE.description)}</p><div class="hero-tags"><span>WEEK ${state.selectedProgram === 'crownforge' ? state.selectedWeek : 1}</span><span>WEEKS 1–14 VERIFIED</span><span>PROGRAM PROTECTED</span></div></div><div class="program-progress"><span>VERIFIED STRUCTURE</span><strong>${embeddedWeeks.length}/14 WEEKS</strong><div class="progress-bar"><span style="width:${embeddedPercent}%"></span></div></div></section>

    <div class="section-title roadmap-title"><div><div class="page-kicker">Long-term strength & athletic development</div><h2>BLACK CROWN</h2></div><span class="badge mandatory">ACTIVE SOURCE</span></div>
    <section class="black-crown-panel v2-roadmap-priority">
      <div class="black-crown-copy"><div class="crown-seal">♛</div><h2>${esc(BLACK_CROWN.name)}</h2><p>${esc(BLACK_CROWN.description)}</p><div class="source-note">54 governed weeks • 270 sessions • nine six-week blocks • Black Crown Revised v2.0.</div></div>
      <div class="black-crown-phases">${blackCrownRoadmap}</div>
    </section>
    <div class="program-current-week-label"><div><div class="page-kicker">Governed Black Crown detail</div><h2>BLACK CROWN WEEKS</h2></div><span>Tap a week, then a day to train it</span></div>
    <nav class="program-week-nav black-crown-week-nav" aria-label="Black Crown governed weeks"><span>JUMP TO</span>${BLACK_CROWN.weekData.map((week) => `<button class="${state.selectedProgram === 'black-crown' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-black-crown-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    <div class="program-weeks-compact black-crown-weeks-compact">${blackCrownCards}</div>

    <div class="program-current-week-label"><div><div class="page-kicker">Governed Crownforge detail</div><h2>VERIFIED WEEKS</h2></div><span>Tap a week to inspect it</span></div>
    <nav class="program-week-nav" aria-label="Embedded Crownforge weeks"><span>JUMP TO</span>${embeddedWeeks.map((week) => `<button class="${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    <div class="program-weeks-compact">${weekCards}</div>

    <div class="section-title"><div><div class="page-kicker">Mandatory handoff</div><h2>CROWN MAINTENANCE</h2><p class="muted">Three governed bridge weeks after Crownforge testing and before Black Crown Week 1.</p></div><span class="badge mandatory">3 weeks embedded</span></div>
    <section class="program-hero card"><div><span class="program-chip active">ENTRY BRIDGE</span><h2>${esc(CROWN_MAINTENANCE.name)}</h2><p>${esc(CROWN_MAINTENANCE.description)}</p><div class="hero-tags"><span>POST-TEST</span><span>STRENGTH RETENTION</span><span>ACTIVATION</span></div></div><div class="program-progress"><span>EMBEDDED SOURCE</span><strong>3/3 WEEKS</strong><div class="progress-bar"><span style="width:100%"></span></div></div></section>
    <div class="program-weeks-compact maintenance-weeks-compact">${maintenanceCards}</div>

    <details class="source-details"><summary>Source governance notes</summary>${CROWNFORGE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${CROWN_MAINTENANCE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${BLACK_CROWN.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}</details>`
'''
text = text[:start] + program_page + text[end:]

# Program navigation must preserve the program key instead of collapsing every
# non-Maintenance day back to Crownforge.
bind_start = text.find('function bindProgramEvents(): void {')
bind_end = text.find('\nfunction bindProgressEvents', bind_start)
if bind_start < 0 or bind_end < 0:
    raise SystemExit('Black Crown UI could not locate bindProgramEvents boundaries')
bind_program = r'''function bindProgramEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-open-day]').forEach((el) => el.addEventListener('click', async () => {
    const requested = el.dataset.openProgram
    state.selectedProgram = requested === 'black-crown' ? 'black-crown' : requested === 'crown-maintenance' ? 'crown-maintenance' : 'crownforge'
    state.selectedWeek = Number(el.dataset.openWeek ?? 1)
    state.selectedDay = Number(el.dataset.openDay ?? 1)
    await refreshWorkout()
    location.hash = '#/train'
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-jump-week]').forEach((button) => button.addEventListener('click', () => {
    const week = Number(button.dataset.jumpWeek ?? 1)
    document.querySelector<HTMLElement>(`#program-week-${week}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelectorAll<HTMLButtonElement>('[data-jump-week]').forEach((item) => item.classList.toggle('active', item === button))
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-jump-black-crown-week]').forEach((button) => button.addEventListener('click', () => {
    const week = Number(button.dataset.jumpBlackCrownWeek ?? 1)
    document.querySelector<HTMLElement>(`#black-crown-week-${week}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelectorAll<HTMLButtonElement>('[data-jump-black-crown-week]').forEach((item) => item.classList.toggle('active', item === button))
  }))
}'''
text = text[:bind_start] + bind_program + text[bind_end:]

# Make workout/exercise intelligence program-aware.
text = text.replace("getApprovedSubstitutions(exercise.name, 'Crownforge')", "getApprovedSubstitutions(exercise.name, selectedSubstitutionProgram())")
text = text.replace("getApprovedSubstitutions(name, 'Crownforge')", "getApprovedSubstitutions(name, selectedSubstitutionProgram())")
text = text.replace("for (const week of [...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData])", "for (const week of [...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData, ...BLACK_CROWN.weekData])")
text = text.replace('all programmed Crownforge + Crown Maintenance names audited against the embedded source library.', 'all programmed Crownforge + Crown Maintenance + Black Crown names audited against the embedded source library.')
text = text.replace('They never silently rewrite Crownforge.', 'They never silently rewrite the selected governed program.')

# Remove stale Crownforge-only labels from runtime surfaces while retaining the
# current dated calendar as Crownforge/Maintenance-owned.
text = text.replace("<div class=\"hero-brandline\"><span>${homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : 'CROWNFORGE'}</span><em>v2.1</em></div>", "<div class=\"hero-brandline\"><span>${esc(homeProgramName.toUpperCase())}</span><em>${homeProgram === 'black-crown' ? 'v2.0' : 'v2.1'}</em></div>")
text = text.replace("<div><span>Program</span><strong>${homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div>", "<div><span>Program</span><strong>${esc(homeProgramName)}</strong></div>")
text = text.replace("<div class=\"score-card\"><span>PROGRAM</span><strong>CROWNFORGE</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", "<div class=\"score-card\"><span>PROGRAM</span><strong>${esc(selectedProgramName().toUpperCase())}</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>")
text = text.replace("<h2>${esc(day?.title ?? 'Crownforge')}</h2><div class=\"context-grid\"><div><span>Program</span><strong>${state.selectedProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div>", "<h2>${esc(day?.title ?? selectedProgramName())}</h2><div class=\"context-grid\"><div><span>Program</span><strong>${esc(selectedProgramName())}</strong></div>")
text = text.replace("<h2>${esc(day?.title ?? 'Crownforge')}</h2><p>${esc(day?.readinessRule", "<h2>${esc(day?.title ?? selectedProgramName())}</h2><p>${esc(day?.readinessRule")
text = text.replace("<div class=\"profile-program\"><span>CURRENT PROGRAM</span><strong>Crownforge</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", "<div class=\"profile-program\"><span>CURRENT PROGRAM</span><strong>${esc(selectedProgramName())}</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>")
text = text.replace('never rewrites Crownforge.', 'never rewrites the selected governed program.')

# Home milestone should not point a Black Crown athlete back to Crownforge tests.
old_milestone = '<div><div class="page-kicker">Next Milestone</div><h2>Verified testing • Weeks 13–14</h2><p class="muted">Black Crown entry uses the governed Crownforge testing + Crown Maintenance handoff.</p></div>'
new_milestone = '<div><div class="page-kicker">Next Milestone</div><h2>${homeProgram === \'black-crown\' ? `Black Crown Block ${Math.ceil((today?.week ?? state.selectedWeek) / 6)} completion` : \'Verified testing • Weeks 13–14\'}</h2><p class="muted">${homeProgram === \'black-crown\' ? \'Complete the current governed six-week block before advancing.\' : \'Black Crown entry uses the governed Crownforge testing + Crown Maintenance handoff.\'}</p></div>'
text = text.replace(old_milestone, new_milestone)

p.write_text(text)
PY

MAIN="$TARGET_DIR/src/main.ts"
grep -Fq '54 governed weeks • 270 sessions' "$MAIN"
grep -Fq 'data-black-crown-week-drawer' "$MAIN"
grep -Fq 'data-open-program="black-crown"' "$MAIN"
grep -Fq 'data-jump-black-crown-week' "$MAIN"
grep -Fq "requested === 'black-crown' ? 'black-crown'" "$MAIN"
grep -Fq '...BLACK_CROWN.weekData' "$MAIN"
grep -Fq 'selectedSubstitutionProgram()' "$MAIN"
grep -Fq 'BLACK CROWN WEEKS' "$MAIN"
grep -Fq 'v2-roadmap-priority' "$MAIN"
grep -Fq 'WEEKS 1–14 VERIFIED' "$MAIN"
grep -Fq 'VERIFIED WEEKS' "$MAIN"

echo "Command V2 Black Crown governed UI integration: PASS"
