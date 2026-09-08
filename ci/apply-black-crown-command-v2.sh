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

old_import = "import { CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN, getCalendarDay, getCrownforgeDay, getCrownforgeWeek, getCrownMaintenanceDay, getCrownMaintenanceWeek, type CalendarProgramKey, type ProgramDay, type ProgramExercise, type ProgramWeek } from './data/programs'"
new_import = "import { CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN, BLACK_CROWN_BLOCKS, getCalendarDay, getProgram, getProgramDay as getRegisteredProgramDay, getProgramWeek as getRegisteredProgramWeek, type PublicProgramKey, type ProgramDay, type ProgramExercise, type ProgramWeek } from './data/programs'"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('main program import marker not found')

text = text.replace('  selectedProgram: CalendarProgramKey\n', '  selectedProgram: PublicProgramKey\n', 1)

helper_pattern = re.compile(r"function getProgramDay\(program: CalendarProgramKey, week: number, day: number\): ProgramDay \| null \{.*?\n\}\n\nfunction getProgramWeek\(program: CalendarProgramKey, week: number\): ProgramWeek \| null \{.*?\n\}\n\nfunction selectedProgramName\(\): string \{.*?\n\}", re.S)
helper_replacement = """function getProgramDay(program: PublicProgramKey, week: number, day: number): ProgramDay | null {
  return getRegisteredProgramDay(program, week, day)
}

function getProgramWeek(program: PublicProgramKey, week: number): ProgramWeek | null {
  return getRegisteredProgramWeek(program, week)
}

function selectedProgramName(): string {
  return getProgram(state.selectedProgram)?.name ?? 'LetMeFly'
}

function selectedProgramCode(program: PublicProgramKey = state.selectedProgram): string {
  return program === 'black-crown' ? 'BC' : program === 'crown-maintenance' ? 'CM' : 'CF'
}

function substitutionProgramFor(program: PublicProgramKey): 'Crownforge' | 'Black Crown' | 'Crown Maintenance' {
  return program === 'black-crown' ? 'Black Crown' : program === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'
}"""
text, count = helper_pattern.subn(helper_replacement, text, count=1)
if count != 1 and 'function selectedProgramCode(' not in text:
    raise SystemExit(f'program helper replacement count={count}')

text = text.replace("<span>${state.selectedProgram === 'crown-maintenance' ? 'CM' : 'CF'} • W${state.selectedWeek} • D${state.selectedDay}</span>", "<span>${selectedProgramCode()} • W${state.selectedWeek} • D${state.selectedDay}</span>", 1)
text = text.replace("  const homeProgram = today?.program ?? state.selectedProgram\n", "  const homeProgram: PublicProgramKey = today?.program ?? state.selectedProgram\n", 1)

text = text.replace("<div class=\"hero-brandline\"><span>${homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : 'CROWNFORGE'}</span><em>v2.1</em></div>", "<div class=\"hero-brandline\"><span>${esc((getProgram(homeProgram)?.name ?? 'LetMeFly').toUpperCase())}</span><em>${esc(getProgram(homeProgram)?.version ?? '')}</em></div>", 1)
text = text.replace("<div><span>Program</span><strong>${homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div>", "<div><span>Program</span><strong>${esc(getProgram(homeProgram)?.name ?? 'LetMeFly')}</strong></div>", 1)
text = text.replace("<div class=\"milestone-icon\">♛</div>\n        <div><div class=\"page-kicker\">Next Milestone</div><h2>Verified testing • Weeks 13–14</h2><p class=\"muted\">Black Crown entry uses the governed Crownforge testing + Crown Maintenance handoff.</p></div>", "<div class=\"milestone-icon\">♛</div>\n        <div><div class=\"page-kicker\">Next Milestone</div><h2>${homeProgram === 'black-crown' ? `Black Crown Block ${Math.ceil((today?.week ?? state.selectedWeek) / 6)} completion` : 'Verified testing • Weeks 13–14'}</h2><p class=\"muted\">${homeProgram === 'black-crown' ? 'Progress through the current six-week block without changing governed prescriptions.' : 'Black Crown entry uses the governed Crownforge testing + Crown Maintenance handoff.'}</p></div>", 1)

text = text.replace("<div class=\"day-strip\">${(currentWeek?.days ?? []).map((d) => `<button class=\"day-chip ${d.day === state.selectedDay ? 'active' : ''}\" data-day=\"${d.day}\"><strong>D${d.day}</strong><small>${esc(d.date.slice(5))}</small></button>`).join('')}</div>", "<div class=\"day-strip\">${(currentWeek?.days ?? []).map((d) => `<button class=\"day-chip ${d.day === state.selectedDay ? 'active' : ''}\" data-day=\"${d.day}\"><strong>D${d.day}</strong><small>${d.date ? esc(d.date.slice(5)) : `W${currentWeek?.week ?? state.selectedWeek}`}</small></button>`).join('')}</div>", 1)

text = text.replace("getApprovedSubstitutions(exercise.name, 'Crownforge')", "getApprovedSubstitutions(exercise.name, substitutionProgramFor(state.selectedProgram))", 1)
text = text.replace("getApprovedSubstitutions(name, 'Crownforge')", "getApprovedSubstitutions(name, substitutionProgramFor(state.selectedProgram))", 1)

program_start = text.find('}function programPage(): string {')
progress_start = text.find('}function progressPageShell(): string {')
if program_start < 0 or progress_start < 0 or progress_start <= program_start:
    raise SystemExit('programPage boundaries not found')
program_fn = r'''}function programPage(): string {
  const activeProgram = getProgram(state.selectedProgram) ?? CROWNFORGE
  const activeWeeks = activeProgram.weekData
  const isBlackCrown = state.selectedProgram === 'black-crown'
  const isMaintenance = state.selectedProgram === 'crown-maintenance'
  const totalWeeks = activeProgram.weeks
  const embeddedPercent = Math.min(100, Math.round((activeWeeks.length / totalWeeks) * 100))
  const statusLabel = isBlackCrown ? '54 weeks governed' : isMaintenance ? 'Mandatory bridge' : 'Governed source'
  const roadmap = isBlackCrown ? `<div class="black-crown-phases">
      <div class="bc-phase foundation"><span>01</span><div><strong>FOUNDATION / RE-ENTRY</strong><small>Weeks 1–6</small></div></div>
      <div class="bc-phase foundation"><span>02</span><div><strong>STRENGTH ACCUMULATION</strong><small>Weeks 7–12</small></div></div>
      <div class="bc-phase volume"><span>03</span><div><strong>STRENGTH PEAK</strong><small>Weeks 13–18</small></div></div>
      <div class="bc-phase volume"><span>04</span><div><strong>STRENGTH CONSOLIDATION</strong><small>Weeks 19–24</small></div></div>
      <div class="bc-phase intensity"><span>05</span><div><strong>POWERBUILDING + YOKE</strong><small>Weeks 25–30</small></div></div>
      <div class="bc-phase intensity"><span>06</span><div><strong>SPECIFICITY BRIDGE</strong><small>Weeks 31–36</small></div></div>
      <div class="bc-phase realization"><span>07</span><div><strong>CRAZY IVAN REBUILD</strong><small>Weeks 37–42</small></div></div>
      <div class="bc-phase realization"><span>08</span><div><strong>POST-REALIZATION REBUILD</strong><small>Weeks 43–48</small></div></div>
      <div class="bc-phase realization"><span>09</span><div><strong>FINAL REALIZATION</strong><small>Weeks 49–54</small></div></div>
    </div>` : isMaintenance ? `<div class="phase-roadmap crownforge-roadmap"><div class="phase-card active"><span>01</span><h3>BRIDGE</h3><p>Post-test strength retention and activation.</p></div></div>` : `<div class="phase-roadmap crownforge-roadmap"><div class="phase-card active"><span>01</span><h3>REBUILD</h3><p>Strength base, movement quality, capacity.</p></div><div class="phase-card"><span>02</span><h3>PREPARE</h3><p>Power, sleds, carries, resilience.</p></div><div class="phase-card"><span>03</span><h3>VERIFY</h3><p>Testing and governed handoff.</p></div></div>`

  const weekCards = activeWeeks.map((week) => {
    const start = week.days[0]?.date
    const end = week.days[week.days.length - 1]?.date
    const range = start && end ? `${esc(start)}–${esc(end.slice(5))}` : isBlackCrown ? `Block ${Math.ceil(week.week / 6)} • Week ${week.week}` : `Week ${week.week}`
    const block = isBlackCrown ? BLACK_CROWN_BLOCKS.find((item) => week.week >= item.startWeek && week.week <= item.endWeek) : null
    const intent = block ? `${block.title} • ${week.intent}` : week.intent
    return `<section id="program-${state.selectedProgram}-week-${week.week}" class="program-week ${week.week === state.selectedWeek ? 'active' : ''}"><div class="section-title"><div><div class="page-kicker">Week ${week.week} • ${range}</div><h2>${esc(intent)}</h2></div><span class="badge mandatory">${statusLabel}</span></div><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${week.week === state.selectedWeek && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="${state.selectedProgram}"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section>`
  }).join('')

  return `<div class="page-head cinematic-head"><div class="page-kicker">Program intelligence</div><h1>THE ROADMAP</h1><p class="muted">Governed program source stays separate from private athlete history and workout logging.</p></div>
    <nav class="program-week-nav" aria-label="Program selector"><span>PROGRAM</span><button class="${state.selectedProgram === 'crownforge' ? 'active' : ''}" data-select-program="crownforge">CROWNFORGE</button><button class="${state.selectedProgram === 'crown-maintenance' ? 'active' : ''}" data-select-program="crown-maintenance">MAINTENANCE</button><button class="${state.selectedProgram === 'black-crown' ? 'active' : ''}" data-select-program="black-crown">BLACK CROWN</button></nav>
    <section class="program-hero card"><div><span class="program-chip active">${isBlackCrown ? 'LONG-TERM SYSTEM' : isMaintenance ? 'ENTRY BRIDGE' : 'CURRENT PROGRAM'}</span><h2>${esc(activeProgram.name)}</h2><p>${esc(activeProgram.description)}</p><div class="hero-tags"><span>${activeWeeks.length}/${totalWeeks} WEEKS</span><span>${isBlackCrown ? '9 GOVERNED BLOCKS' : 'SOURCE PROTECTED'}</span></div></div><div class="program-progress"><span>EMBEDDED SOURCE</span><strong>${activeWeeks.length}/${totalWeeks} WEEKS</strong><div class="progress-bar"><span style="width:${embeddedPercent}%"></span></div></div></section>
    ${roadmap}
    <nav class="program-week-nav" aria-label="${esc(activeProgram.name)} weeks"><span>JUMP TO</span>${activeWeeks.map((week) => `<button class="${week.week === state.selectedWeek ? 'active' : ''}" data-jump-program-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    ${weekCards}
    <details class="source-details"><summary>Source governance notes</summary>${activeProgram.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}</details>`
'''
text = text[:program_start] + program_fn + text[progress_start:]

text = text.replace("<div class=\"score-card\"><span>PROGRAM</span><strong>CROWNFORGE</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", "<div class=\"score-card\"><span>PROGRAM</span><strong>${esc(selectedProgramName().toUpperCase())}</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", 1)

text = text.replace("for (const week of [...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData])", "for (const week of [...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData, ...BLACK_CROWN.weekData])", 1)
text = text.replace("const alternatives = getApprovedSubstitutions(name, 'Crownforge')", "const alternatives = getApprovedSubstitutions(name, substitutionProgramFor(state.selectedProgram))", 1)
text = text.replace("all programmed Crownforge + Crown Maintenance names audited against the embedded source library.", "all programmed Crownforge + Crown Maintenance + Black Crown names audited against the embedded source library.", 1)
text = text.replace("They never silently rewrite Crownforge.", "They never silently rewrite the selected governed program.", 1)

text = text.replace("<h2>${esc(day?.title ?? 'Crownforge')}</h2><div class=\"context-grid\"><div><span>Program</span><strong>${state.selectedProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div>", "<h2>${esc(day?.title ?? selectedProgramName())}</h2><div class=\"context-grid\"><div><span>Program</span><strong>${esc(selectedProgramName())}</strong></div>", 1)
text = text.replace("<h2>${esc(day?.title ?? 'Crownforge')}</h2><p>${esc(day?.readinessRule", "<h2>${esc(day?.title ?? selectedProgramName())}</h2><p>${esc(day?.readinessRule", 1)
text = text.replace("<div class=\"profile-program\"><span>CURRENT PROGRAM</span><strong>Crownforge</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", "<div class=\"profile-program\"><span>CURRENT PROGRAM</span><strong>${esc(selectedProgramName())}</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>", 1)
text = text.replace("never rewrites Crownforge.`", "never rewrites the selected governed program.`", 1)

bind_pattern = re.compile(r"function bindProgramEvents\(\): void \{.*?\n\}\n\nfunction bindProgressEvents", re.S)
bind_replacement = r'''function bindProgramEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-open-day]').forEach((el) => el.addEventListener('click', async () => {
    const requested = el.dataset.openProgram
    state.selectedProgram = requested === 'black-crown' ? 'black-crown' : requested === 'crown-maintenance' ? 'crown-maintenance' : 'crownforge'
    state.selectedWeek = Number(el.dataset.openWeek ?? 1)
    state.selectedDay = Number(el.dataset.openDay ?? 1)
    await refreshWorkout()
    location.hash = '#/train'
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-select-program]').forEach((button) => button.addEventListener('click', async () => {
    const requested = button.dataset.selectProgram
    state.selectedProgram = requested === 'black-crown' ? 'black-crown' : requested === 'crown-maintenance' ? 'crown-maintenance' : 'crownforge'
    state.selectedWeek = 1
    state.selectedDay = 1
    await refreshWorkout()
    render()
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-jump-program-week]').forEach((button) => button.addEventListener('click', () => {
    const week = Number(button.dataset.jumpProgramWeek ?? 1)
    state.selectedWeek = week
    document.querySelector<HTMLElement>(`#program-${state.selectedProgram}-week-${week}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelectorAll<HTMLButtonElement>('[data-jump-program-week]').forEach((item) => item.classList.toggle('active', item === button))
  }))
}

function bindProgressEvents'''
text, count = bind_pattern.subn(bind_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'bindProgramEvents replacement count={count}')

p.write_text(text)
PY

MAIN="$TARGET_DIR/src/main.ts"
grep -Fq "selectedProgram: PublicProgramKey" "$MAIN"
grep -Fq "return getRegisteredProgramDay(program, week, day)" "$MAIN"
grep -Fq "data-select-program=\"black-crown\"" "$MAIN"
grep -Fq "9 GOVERNED BLOCKS" "$MAIN"
grep -Fq "data-open-program=\"${state.selectedProgram}\"" "$MAIN"
grep -Fq "BLACK_CROWN_BLOCKS.find" "$MAIN"
grep -Fq "CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData, ...BLACK_CROWN.weekData" "$MAIN"
grep -Fq "substitutionProgramFor(state.selectedProgram)" "$MAIN"
grep -Fq "d.date ? esc(d.date.slice(5))" "$MAIN"

echo "Command V2 Black Crown program integration: PASS"
