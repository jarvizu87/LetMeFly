import './styles.css'
import { openLetMeFlyDb, recoverStaleOutboxOperations, getAll, type LocalDomainRecord } from './db/local-db'
import { CROWNFORGE, CROWN_MAINTENANCE, BLACK_CROWN, getCalendarDay, getCrownforgeDay, getCrownforgeWeek, getCrownMaintenanceDay, getCrownMaintenanceWeek, type CalendarProgramKey, type ProgramDay, type ProgramExercise, type ProgramWeek } from './data/programs'
import {
  EXERCISE_LIBRARY_SOURCE_TOTAL,
  APPROVED_SUBSTITUTION_SOURCE_TOTAL,
  exerciseVideoStatusLabel,
  getApprovedSubstitutions,
  getExerciseMatches,
  getPrimaryExerciseMatch,
  safeFallbackSearchUrl,
} from './data/exercise-library'
import { getActiveAthlete, createLocalAthlete, getCurrentProgramInstance, getLatestTrainingMaxes, setTrainingMax, updateAthleteName } from './services/athlete-service'
import { findWorkoutForDay, startWorkout, logSet, uncompleteSet, completeWorkout, recentWorkoutSessions, type WorkoutBundle } from './services/workout-service'
import { saveReadiness, latestReadiness, readinessColor } from './services/readiness-service'
import { calculatePlates, formatPlates } from './services/barbell'
import { createCloudRuntime, type CloudRuntime } from './services/cloud-runtime'
import { toPrivateVaultViewModel } from './auth/private-vault-view-model'
import type { AccountSnapshot } from './auth/auth-types'
import { discoverLegacyMigration, runSafeLegacyMigration, type Stage9DiscoveryResult } from './migration/stage9-migration'
import { migrationReportText, downloadRawLegacyBackup } from './migration/migration-report'
import { createAthleteBackup, downloadBackupFile } from './backup/backup-service'
import { downloadCsvExports } from './backup/csv-export'
import { openPrintableReport } from './backup/printable-report'
import { previewRestoreText, restoreFromBackup } from './restore/restore-service'

const APP_VERSION = '5.4.0-rebuild.2'
const root = document.querySelector<HTMLDivElement>('#app')!

type Route = 'home' | 'train' | 'program' | 'progress' | 'exercises' | 'coach' | 'profile' | 'more'

interface AppState {
  route: Route
  athlete: LocalDomainRecord | null
  programInstance: LocalDomainRecord | null
  selectedProgram: CalendarProgramKey
  selectedWeek: number
  selectedDay: number
  workout: WorkoutBundle | null
  cloud: CloudRuntime
  cloudSnapshot: AccountSnapshot | null
  legacy: Stage9DiscoveryResult | null
  toast: string | null
}

const calendar = getCalendarDay(new Date())
const state: AppState = {
  route: routeFromHash(),
  athlete: null,
  programInstance: null,
  selectedProgram: calendar?.program ?? 'crownforge',
  selectedWeek: calendar?.week ?? 1,
  selectedDay: calendar?.day ?? 1,
  workout: null,
  cloud: createCloudRuntime(APP_VERSION),
  cloudSnapshot: null,
  legacy: null,
  toast: null,
}

void boot()

async function boot(): Promise<void> {
  try {
    await openLetMeFlyDb().then((db) => db.close())
    await recoverStaleOutboxOperations()
    state.athlete = await getActiveAthlete()
    if (state.athlete) {
      state.programInstance = await getCurrentProgramInstance(state.athlete.id)
      await refreshWorkout()
    } else {
      try {
        const discovery = await discoverLegacyMigration()
        state.legacy = discovery.snapshot.candidates.length ? discovery : null
      } catch (error) {
        console.warn('Legacy discovery skipped', error)
      }
    }

    render()

    if (state.cloud.configured) {
      state.cloud.vault.subscribe((snapshot) => {
        state.cloudSnapshot = snapshot
        updateSyncPill()
      })
      void state.cloud.start().catch((error) => {
        console.warn('Cloud remains optional', error)
        showToast('Cloud unavailable — local training is safe')
      })
    }

    registerServiceWorker()
    window.addEventListener('hashchange', () => {
      state.route = routeFromHash()
      render()
    })
  } catch (error) {
    root.innerHTML = `<main><div class="card"><h1>LetMeFly could not open local storage</h1><p class="muted">${esc(errorMessage(error))}</p></div></main>`
  }
}

function getProgramDay(program: CalendarProgramKey, week: number, day: number): ProgramDay | null {
  return program === 'crown-maintenance' ? getCrownMaintenanceDay(week, day) : getCrownforgeDay(week, day)
}

function getProgramWeek(program: CalendarProgramKey, week: number): ProgramWeek | null {
  return program === 'crown-maintenance' ? getCrownMaintenanceWeek(week) : getCrownforgeWeek(week)
}

function selectedProgramName(): string {
  return state.selectedProgram === 'crown-maintenance' ? CROWN_MAINTENANCE.name : CROWNFORGE.name
}

async function refreshWorkout(): Promise<void> {
  if (!state.athlete) return
  state.workout = await findWorkoutForDay(state.athlete.id, state.selectedProgram, state.selectedWeek, state.selectedDay)
}

function render(): void {
  root.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      <main>${routeContent()}</main>
      ${navbar()}
      ${!state.athlete ? onboardingModal() : ''}
      ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}
    </div>
  `
  bindCommonEvents()
  bindRouteEvents()
  updateSyncPill()
}

function topbar(): string {
  const routeNames: Record<Route, string> = {
    home: 'Command', train: 'Train', program: 'Program', progress: 'Progress', exercises: 'Exercises', coach: 'Coach', profile: 'Profile', more: 'More',
  }
  return `
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="LetMeFly home">
        <div class="brand-mark">♛</div>
        <div class="brand-word">LETMEFLY<small>TRAIN HARDER. BECOME MORE.</small></div>
      </a>
      <div class="topbar-context"><strong>${routeNames[state.route]}</strong><span>${state.selectedProgram === 'crown-maintenance' ? 'CM' : 'CF'} • W${state.selectedWeek} • D${state.selectedDay}</span></div>
      <div id="sync-pill" class="sync-pill"><i class="dot ${state.cloud.configured ? 'yellow' : 'purple'}"></i>${state.cloud.configured ? 'Cloud starting' : 'Local only'}</div>
    </header>
  `
}function navbar(): string {
  const items: Array<[Route, string, string, string]> = [
    ['home', '⌂', 'Home', 'primary'], ['train', '⚔', 'Train', 'primary'], ['program', '▦', 'Program', 'primary'], ['progress', '↗', 'Progress', 'primary'],
    ['exercises', '◫', 'Exercises', 'secondary'], ['coach', '◉', 'Coach', 'secondary'], ['profile', '●', 'Profile', 'secondary'], ['more', '☰', 'More', 'more'],
  ]
  return `<nav class="navbar" aria-label="Primary navigation">${items.map(([route, icon, label, group]) => `<a class="nav-item nav-${group} ${state.route === route ? 'active' : ''}" href="#/${route}"><span>${icon}</span>${label}</a>`).join('')}</nav>`
}function routeContent(): string {
  if (!state.athlete) return `<div class="hero onboarding-hero"><div class="page-kicker">Private local vault</div><h1>Your training data starts on this device.</h1><p class="muted">Create a local athlete or safely inspect the legacy LetMeFly state detected in this browser. No account is required.</p></div>`
  switch (state.route) {
    case 'home': return homePage()
    case 'train': return trainPage()
    case 'program': return programPage()
    case 'progress': return progressPageShell()
    case 'exercises': return exercisesPage()
    case 'coach': return coachPage()
    case 'profile': return profilePage()
    case 'more': return morePage()
  }
}function homePage(): string {
  const today = getCalendarDay(new Date())
  const homeProgram = today?.program ?? state.selectedProgram
  const day = getProgramDay(homeProgram, today?.week ?? state.selectedWeek, today?.day ?? state.selectedDay)
  const beforeStart = new Date() < new Date('2026-09-07T00:00:00')
  const title = beforeStart ? 'LOWER + BENCH FREQUENCY + GLUTES' : day ? day.title : 'CROWNFORGE'
  const sub = beforeStart ? 'Foundation • Week 1 • Day 1 • Sep 7' : day ? `${homeProgram === 'crown-maintenance' ? 'Crown Maintenance • ' : ''}Week ${today?.week} • Day ${today?.day}` : 'Your current training block'
  const completed = state.workout ? completionStats(state.workout) : { done: 0, total: 0, percent: 0 }
  const focus = (day?.sections ?? []).slice(0, 4).map((section, index) => `<div class="focus-chip"><span>${['01','02','03','04'][index] ?? '•'}</span>${esc(section.title.replace(/^\w+\s*•?\s*/, ''))}</div>`).join('')
  return `
    <section class="command-hero">
      <div class="hero-art" aria-hidden="true"></div>
      <div class="hero-content">
        <div class="hero-brandline"><span>${homeProgram === 'crown-maintenance' ? 'CROWN MAINTENANCE' : 'CROWNFORGE'}</span><em>v2.1</em></div>
        <div class="page-kicker">${esc(sub)}</div>
        <h1 class="hero-title">${esc(title)}</h1>
        <p class="hero-copy">${esc(day?.role ?? 'Build strength, work capacity, movement quality, and readiness for Black Crown.')}</p>
        <div class="hero-tags"><span>STRENGTH</span><span>WORK CAPACITY</span><span>RESILIENCE</span></div>
        <div class="btn-row hero-actions">
          <button class="btn primary hero-start" data-action="go-train">${state.workout ? 'CONTINUE WORKOUT' : 'START WORKOUT'} <b>›</b></button>
          <button class="btn ghost" data-action="go-program">View Program</button>
        </div>
      </div>
      <div class="hero-progress">
        <div><span>SESSION</span><strong>${completed.total ? `${completed.done}/${completed.total} SETS` : 'READY'}</strong></div>
        <div class="progress-bar"><span style="width:${completed.total ? completed.percent : 8}%"></span></div>
      </div>
    </section>

    <section class="focus-strip">${focus || '<div class="focus-chip"><span>01</span>Readiness</div><div class="focus-chip"><span>02</span>Strength</div><div class="focus-chip"><span>03</span>Capacity</div><div class="focus-chip"><span>04</span>Recovery</div>'}</section>

    <div class="dashboard-grid">
      <section class="card status-card readiness-card">
        <div class="card-head"><div><div class="page-kicker">Readiness</div><h2>Start with the athlete.</h2></div><span id="home-readiness-status" class="status-dot neutral"></span></div>
        <div class="readiness-rings">
          <div class="readiness-ring"><strong id="home-readiness-sleep">—</strong><span>Sleep</span></div>
          <div class="readiness-ring"><strong id="home-readiness-energy">—</strong><span>Energy</span></div>
          <div class="readiness-ring alert"><strong id="home-readiness-soreness">—</strong><span>Soreness</span></div>
        </div>
        <p id="home-readiness-note" class="source-note">Readiness is logged at the front of Workout Mode and only changes allowed cuts — never the program itself.</p>
      </section>

      <section class="card status-card">
        <div class="card-head"><div><div class="page-kicker">Recent / Current</div><h2>The work continues.</h2></div><span class="badge mandatory">Protected</span></div>
        <div class="performance-list">
          <div><span>Program</span><strong>${homeProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div>
          <div><span>Position</span><strong>W${state.selectedWeek} • D${state.selectedDay}</strong></div>
          <div><span>Workout</span><strong>${completed.total ? `${completed.percent}% logged` : 'Not started'}</strong></div>
          <div><span>Private Vault</span><strong>${state.cloudSnapshot?.mode === 'SYNC_ENABLED' ? 'Synced' : 'Local-first'}</strong></div>
        </div>
      </section>

      <section class="card milestone-card">
        <div class="milestone-icon">♛</div>
        <div><div class="page-kicker">Next Milestone</div><h2>Verified testing • Weeks 13–14</h2><p class="muted">Black Crown entry uses the governed Crownforge testing + Crown Maintenance handoff.</p></div>
        <div class="milestone-line"><span style="width:18%"></span></div>
      </section>

      <section class="card coach-focus-card">
        <div class="page-kicker">Coach Focus</div><h2>Quality before density.</h2>
        <p>${esc(day?.readinessRule ?? 'Preserve programmed priorities and training quality.')}</p>
        ${day?.cutOrder ? `<div class="callout warning"><strong>Cut order:</strong> ${esc(day.cutOrder)}</div>` : ''}
        <button class="btn ghost" data-action="go-coach">ASK COACH</button>
      </section>
    </div>
  `
}function trainPage(): string {
  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  if (!day) return `<div class="empty">No governed source day is loaded for this program position.</div>`
  const currentWeek = getProgramWeek(state.selectedProgram, state.selectedWeek)
  const sections = state.workout ? workoutSwipePages(day, state.workout) : previewSwipePages(day)
  const totalPages = day.sections.length + 2
  return `
    <section class="train-shell">
      <div class="train-header">
        <div><div class="page-kicker">${esc(selectedProgramName())} • Week ${state.selectedWeek} • Day ${state.selectedDay}</div><h1>${esc(day.title)}</h1><p class="muted">${esc(day.role)}</p></div>
        <span class="badge ${day.restDay ? 'optional' : 'mandatory'}">${day.restDay ? 'Recovery' : 'Workout'}</span>
      </div>
      <div class="session-track" id="session-track"><button class="active" data-session-index="0">READINESS</button>${day.sections.map((s, i) => `<button data-session-index="${i + 1}">${String.fromCharCode(65+i)}</button>`).join('')}<button data-session-index="${totalPages - 1}">REVIEW</button></div>
      <div class="day-strip">${(currentWeek?.days ?? []).map((d) => `<button class="day-chip ${d.day === state.selectedDay ? 'active' : ''}" data-day="${d.day}"><strong>D${d.day}</strong><small>${d.date ? esc(d.date.slice(5)) : 'Program'}</small></button>`).join('')}</div>
      <div class="train-rule"><strong>Readiness rule</strong><span>${esc(day.readinessRule)}</span></div>
      <div class="swipe-meta"><span>Swipe or tap a section</span><strong id="session-position">1 / ${totalPages}</strong></div>
      <div class="session-nav" aria-label="Workout section navigation"><button class="session-nav-btn" data-session-step="-1" disabled aria-label="Previous section">‹</button><span id="session-label">READINESS</span><button class="session-nav-btn" data-session-step="1" aria-label="Next section">›</button></div>
      <div class="swipe-viewport" id="swipe-viewport">${sections}</div>
    </section>
  `
}function previewSwipePages(day: ProgramDay): string {
  return `
    ${readinessPage(day, false)}
    ${day.sections.map((section, index) => `<section class="swipe-page workout-panel"><div class="workout-panel-head"><div><div class="page-kicker">${String.fromCharCode(65 + index)} • Training Block</div><h2>${esc(section.title)}</h2>${section.subtitle ? `<p class="muted">${esc(section.subtitle)}</p>` : ''}</div><span class="section-number">${index + 1}/${day.sections.length}</span></div><div class="exercise-stack">${section.exercises.map(programExerciseCard).join('')}</div></section>`).join('')}
    <section class="swipe-page workout-panel review-panel"><div class="review-mark">♛</div><div class="page-kicker">Session Review</div><h2>${day.restDay ? 'Recovery is programmed.' : 'Ready to earn the work.'}</h2><p class="muted">Your first tap writes locally. Cloud is optional and asynchronous.</p><button class="btn primary hero-start" data-action="start-workout">${day.restDay ? 'LOG REST DAY' : 'START WORKOUT'}</button></section>
  `
}function workoutSwipePages(day: ProgramDay, workout: WorkoutBundle): string {
  const bySection = new Map<string, typeof workout.exercises>()
  for (const item of workout.exercises) {
    const key = String(item.record.group_key ?? 'other')
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key)!.push(item)
  }
  const stats = completionStats(workout)
  return `
    ${readinessPage(day, true)}
    ${day.sections.map((section, index) => `<section class="swipe-page workout-panel"><div class="workout-panel-head"><div><div class="page-kicker">${String.fromCharCode(65 + index)} • Workout Section</div><h2>${esc(section.title)}</h2>${section.subtitle ? `<p class="muted">${esc(section.subtitle)}</p>` : ''}</div><span class="section-number">${index + 1}/${day.sections.length}</span></div><div class="exercise-stack">${(bySection.get(section.id) ?? []).map((item) => loggedExerciseCard(item.record, item.sets)).join('') || '<div class="empty">No loggable work in this section.</div>'}</div></section>`).join('')}
    <section class="swipe-page workout-panel review-panel"><div class="review-mark">♛</div><div class="page-kicker">Session Review</div><h2>${stats.done} / ${stats.total} sets logged</h2><div class="progress-bar large"><span style="width:${stats.percent}%"></span></div><p class="muted">History records what actually happened. Program updates never rewrite this session.</p><div class="btn-row"><button class="btn primary hero-start" data-action="complete-workout" ${workout.session.status === 'completed' ? 'disabled' : ''}>${workout.session.status === 'completed' ? 'WORKOUT COMPLETE' : 'COMPLETE WORKOUT'}</button><button class="btn ghost" data-action="sync-now">Sync Now</button></div></section>
  `
}function readinessPage(day: ProgramDay, hasWorkout: boolean): string {
  const scale = (name: string, hint: string) => `<div class="readiness-field"><div class="readiness-label"><strong>${esc(name)}</strong><span>${esc(hint)}</span></div><div class="readiness-options">${[1,2,3,4,5].map((v) => `<label><input type="radio" name="readiness-${slug(name)}" value="${v}" ${v === 3 ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>`
  return `<section class="swipe-page workout-panel readiness-panel"><div class="readiness-graphic"><span>01</span><b>READINESS</b></div><div class="page-kicker">Front of every training day</div><h2>How are you showing up?</h2><p class="muted">This controls allowed auto-regulation. It does not rewrite the governed program.</p><div class="readiness-stack">${scale('Sleep quality', '1 low • 5 high')}${scale('Energy', '1 low • 5 high')}${scale('Soreness', '1 low • 5 high')}${scale('Stress', '1 low • 5 high')}<div class="field"><label>Coach notes</label><textarea id="readiness-notes" class="input" rows="3" placeholder="Anything the coach should know?"></textarea></div></div><div class="btn-row"><button class="btn purple" data-action="save-readiness">SAVE READINESS</button>${!hasWorkout ? `<button class="btn primary" data-action="start-workout">${day.restDay ? 'LOG REST DAY' : 'START WORKOUT'}</button>` : ''}</div></section>`
}function programExerciseCard(exercise: ProgramExercise): string {
  const library = getPrimaryExerciseMatch(exercise.name)
  const status = library ? exerciseVideoStatusLabel(library.videoStatus) : 'Library match pending'
  const alternatives = getApprovedSubstitutions(exercise.name, 'Crownforge')
  return `<div class="exercise-card preview-card"><div class="exercise-title"><div><div class="exercise-eyebrow">${esc(exercise.category)}</div><h3>${esc(exercise.name)}</h3><div class="exercise-meta-line"><span class="badge ${exercise.priority}">${exercise.priority}</span><span class="exercise-source-status">${esc(status)}</span></div></div><div class="exercise-glyph">${exercise.category === 'sled' ? '⇥' : exercise.category === 'kettlebell' ? '◒' : '⚔'}</div></div><div class="prescription-block">${exercise.sets.map((set) => `<div class="prescription-row"><strong>${esc(set.label)}</strong><span>${esc(String(set.reps ?? ''))}${set.loadText ? ` • ${esc(set.loadText)}` : ''}</span></div>`).join('')}${exercise.notes ? `<p class="source-note">${esc(exercise.notes)}</p>` : ''}</div><div class="exercise-actions"><button class="btn small ghost" data-watch="${esc(exercise.name)}">WATCH EXERCISE</button><button class="btn small ghost" data-exercise-info="${esc(exercise.name)}">EXERCISE INFO</button><button class="btn small ghost" data-substitute="${esc(exercise.id)}" data-name="${esc(exercise.name)}">SUBSTITUTE${alternatives.length ? ` (${alternatives.length})` : ''}</button></div></div>`
}function loggedExerciseCard(record: LocalDomainRecord, sets: LocalDomainRecord[]): string {
  const snapshot = (record.prescription_snapshot ?? {}) as Record<string, any>
  const priority = String(snapshot.priority ?? 'conditional')
  const category = String(snapshot.category ?? 'secondary')
  const name = String(record.exercise_name_snapshot)
  const library = getPrimaryExerciseMatch(name)
  const status = library ? exerciseVideoStatusLabel(library.videoStatus) : 'Library match pending'
  const alternatives = getApprovedSubstitutions(name, 'Crownforge')
  return `<div class="exercise-card active-exercise" data-exercise-id="${esc(record.id)}"><div class="exercise-title"><div><div class="exercise-eyebrow">${esc(category)}</div><h3>${esc(name)}</h3><div class="exercise-meta-line"><span class="badge ${esc(priority)}">${esc(priority)}</span><span class="exercise-source-status">${esc(status)}</span></div></div><button class="icon-btn" data-watch="${esc(name)}" aria-label="Watch ${esc(name)}">▶</button></div><div class="set-table">${sets.map((set) => setRow(set)).join('')}</div><div class="exercise-actions"><button class="btn small ghost" data-watch="${esc(name)}">WATCH EXERCISE</button><button class="btn small ghost" data-exercise-info="${esc(name)}">EXERCISE INFO</button><button class="btn small ghost" data-substitute="${esc(String(record.exercise_key))}" data-name="${esc(name)}">SUBSTITUTE${alternatives.length ? ` (${alternatives.length})` : ''}</button><button class="btn small ghost" data-action="go-coach">ASK COACH</button></div></div>`
}function setRow(set: LocalDomainRecord): string {
  const perf = (set.performance_data ?? {}) as Record<string, any>
  const target = [perf.programmedReps, perf.programmedLoadText].filter(Boolean).join(' • ') || String(perf.programmedLabel ?? '')
  const reps = set.reps ?? (typeof perf.programmedReps === 'number' ? perf.programmedReps : '')
  const load = set.load_value ?? ''
  const rpe = set.rpe ?? ''
  const plate = typeof load === 'number' && set.load_unit === 'lb' ? formatPlates(calculatePlates(load)) : ''
  return `<div class="set-row" data-set-id="${esc(set.id)}"><div class="set-label"><span>SET</span><strong>${esc(String(set.set_number))}</strong></div><div class="set-target-cell"><span>Target</span><strong>${esc(target)}</strong></div><div class="set-field"><label>Reps</label><input class="set-input reps-input" inputmode="numeric" value="${esc(String(reps))}"></div><div class="set-field"><label>Load</label><input class="set-input load-input" inputmode="decimal" value="${esc(String(load))}"><small>${esc(plate)}</small></div><div class="set-field rpe-field"><label>RPE</label><input class="set-input rpe-input" inputmode="decimal" value="${esc(String(rpe))}"></div><button class="set-check ${set.completed ? 'done' : ''}" data-action="toggle-set">${set.completed ? '✓' : '○'}</button></div>`
}function programPage(): string {
  const embeddedWeeks = CROWNFORGE.weekData
  const weekCards = CROWNFORGE.weekData.map((week) => {
    const start = week.days[0]?.date ?? ''
    const end = week.days[week.days.length - 1]?.date ?? ''
    return `<section id="program-week-${week.week}" class="program-week ${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}"><div class="section-title"><div><div class="page-kicker">Week ${week.week} • ${esc(start)}–${esc(end.slice(5))}</div><h2>${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'Current Embedded Week' : `Week ${week.week}`}</h2></div><span class="badge mandatory">Governed source</span></div><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="crownforge"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section>`
  }).join('')

  const maintenanceCards = CROWN_MAINTENANCE.weekData.map((week) => {
    const start = week.days[0]?.date ?? ''
    const end = week.days[week.days.length - 1]?.date ?? ''
    return `<section id="maintenance-week-${week.week}" class="program-week ${state.selectedProgram === 'crown-maintenance' && week.week === state.selectedWeek ? 'active' : ''}"><div class="section-title"><div><div class="page-kicker">Bridge Week ${week.week} • ${esc(start)}–${esc(end.slice(5))}</div><h2>${esc(week.intent)}</h2></div><span class="badge mandatory">Mandatory bridge</span></div><div class="week-grid">${week.days.map((day) => `<button class="week-day-card ${state.selectedProgram === 'crown-maintenance' && week.week === state.selectedWeek && day.day === state.selectedDay ? 'active' : ''}" data-open-day="${day.day}" data-open-week="${week.week}" data-open-program="crown-maintenance"><span>DAY ${day.day}</span><strong>${esc(day.title)}</strong><small>${esc(day.role)}</small><i>›</i></button>`).join('')}</div></section>`
  }).join('')

  const embeddedPercent = Math.min(100, Math.round((embeddedWeeks.length / 14) * 100))
  return `<div class="page-head cinematic-head"><div class="page-kicker">Program intelligence</div><h1>THE ROADMAP</h1><p class="muted">Current governed source first. Long-term system next. Program definitions remain protected from workout logging.</p></div>
    <section class="program-hero card"><div><span class="program-chip active">CURRENT PROGRAM</span><h2>${esc(CROWNFORGE.name)}</h2><p>${esc(CROWNFORGE.description)}</p><div class="hero-tags"><span>WEEKS 1–14 EMBEDDED</span><span>TESTING GOVERNED</span></div></div><div class="program-progress"><span>EMBEDDED SOURCE</span><strong>${embeddedWeeks.length}/14 WEEKS</strong><div class="progress-bar"><span style="width:${embeddedPercent}%"></span></div></div></section>
    <nav class="program-week-nav" aria-label="Embedded Crownforge weeks"><span>JUMP TO</span>${embeddedWeeks.map((week) => `<button class="${state.selectedProgram === 'crownforge' && week.week === state.selectedWeek ? 'active' : ''}" data-jump-week="${week.week}">W${week.week}</button>`).join('')}</nav>
    <div class="phase-roadmap crownforge-roadmap">
      <div class="phase-card active"><span>01</span><h3>REBUILD</h3><p>Strength base, movement quality, capacity.</p></div>
      <div class="phase-card"><span>02</span><h3>PREPARE</h3><p>Power, sleds, carries, resilience.</p></div>
      <div class="phase-card"><span>03</span><h3>VERIFY</h3><p>Testing and governed handoff.</p></div>
    </div>
    ${weekCards}
    <div class="section-title"><div><div class="page-kicker">Mandatory handoff</div><h2>CROWN MAINTENANCE</h2><p class="muted">Three governed bridge weeks after testing and before Black Crown Week 1.</p></div><span class="badge mandatory">3 weeks embedded</span></div>
    <section class="program-hero card"><div><span class="program-chip active">ENTRY BRIDGE</span><h2>${esc(CROWN_MAINTENANCE.name)}</h2><p>${esc(CROWN_MAINTENANCE.description)}</p><div class="hero-tags"><span>POST-TEST</span><span>STRENGTH RETENTION</span><span>ACTIVATION</span></div></div><div class="program-progress"><span>EMBEDDED SOURCE</span><strong>3/3 WEEKS</strong><div class="progress-bar"><span style="width:100%"></span></div></div></section>
    ${maintenanceCards}
    <div class="section-title"><div><div class="page-kicker">Next system</div><h2>BLACK CROWN</h2></div><span class="badge optional">Catalog</span></div>
    <section class="black-crown-panel">
      <div class="black-crown-copy"><div class="crown-seal">♛</div><h2>${esc(BLACK_CROWN.name)}</h2><p>${esc(BLACK_CROWN.description)}</p><div class="source-note">The detailed 54-week structured source remains source-gated until imported and audited.</div></div>
      <div class="black-crown-phases">
        <div class="bc-phase foundation"><span>01</span><div><strong>FOUNDATION</strong><small>Weeks 1–12 • Build the base.</small></div></div>
        <div class="bc-phase volume"><span>02</span><div><strong>VOLUME</strong><small>Weeks 13–24 • Add capacity.</small></div></div>
        <div class="bc-phase intensity"><span>03</span><div><strong>INTENSIFICATION</strong><small>Weeks 25–36 • Raise the ceiling.</small></div></div>
        <div class="bc-phase realization"><span>04</span><div><strong>REALIZATION</strong><small>Weeks 37–52+ • Become more.</small></div></div>
      </div>
    </section>
    <details class="source-details"><summary>Source governance notes</summary>${CROWNFORGE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${CROWN_MAINTENANCE.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}${BLACK_CROWN.sourceNotes.map((n) => `<div class="source-note">• ${esc(n)}</div>`).join('')}</details>`
}function progressPageShell(): string {
  return `<div class="page-head cinematic-head"><div class="page-kicker">Athlete-owned history</div><h1>PROGRESS</h1><p class="muted">Strength, work, and consistency without rewriting completed history.</p></div><div id="progress-content"><div class="card loading-card">Loading your history…</div></div>`
}async function renderProgressAsync(): Promise<void> {
  if (state.route !== 'progress' || !state.athlete) return
  const target = document.querySelector('#progress-content')
  if (!target) return
  const tms = await getLatestTrainingMaxes(state.athlete.id)
  const workouts = await recentWorkoutSessions(state.athlete.id, 8)
  const lifts = [
    ['front-squat','Front Squat'], ['back-squat','Back Squat'], ['bench-press','Bench Press'], ['deadlift','Deadlift'], ['overhead-press','Overhead Press'], ['clean','Clean'],
  ]
  const savedTms = lifts.map(([key,name]) => ({ key, name, row: tms[key] })).filter((x) => x.row)
  target.innerHTML = `<div class="progress-score-grid">
      <div class="score-card hero-score"><span>WORKOUTS LOGGED</span><strong>${workouts.length}</strong><small>Recent history window</small></div>
      <div class="score-card"><span>TRAINING MAXES</span><strong>${savedTms.length}</strong><small>Current lift records</small></div>
      <div class="score-card"><span>PROGRAM</span><strong>CROWNFORGE</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div>
    </div>
    <div class="card tm-board"><div class="card-head"><div><div class="page-kicker">Strength Dashboard</div><h2>Training Maxes</h2><p class="muted">Updates append new effective-dated records.</p></div><span class="badge mandatory">Private</span></div><div class="tm-grid">${lifts.map(([key,name]) => { const row=tms[key]; return `<div class="tm-card"><span>${esc(name)}</span><div class="tm-input-wrap"><input class="tm-input" data-tm-key="${key}" type="number" min="0" step="2.5" value="${esc(String(row?.tm_value ?? ''))}" placeholder="—"><select class="tm-unit" data-tm-unit="${key}"><option value="lb" ${row?.tm_unit === 'kg' ? '' : 'selected'}>lb</option><option value="kg" ${row?.tm_unit === 'kg' ? 'selected' : ''}>kg</option></select></div></div>` }).join('')}</div><button class="btn primary" data-action="save-tms">SAVE TM UPDATES</button></div>
    <div class="section-title"><div><div class="page-kicker">History</div><h2>Recent Workouts</h2></div></div><div class="history-list">${workouts.length ? workouts.map((w) => `<div class="history-card"><div class="history-icon">✓</div><div><span>${esc(String(w.started_at ?? w.scheduled_for ?? '')).slice(0,10)}</span><strong>${esc(String(w.workout_name ?? 'Workout'))}</strong><small>${esc(String(w.program_key ?? ''))} • W${esc(String(w.week_number ?? ''))} • ${esc(String(w.day_key ?? ''))}</small></div><em>${esc(String(w.status ?? ''))}</em></div>`).join('') : '<div class="card empty">No workouts logged yet.</div>'}</div>`
  bindProgressEvents()
}
function exercisesPage(): string {
  const programNames = new Set<string>()
  for (const week of [...CROWNFORGE.weekData, ...CROWN_MAINTENANCE.weekData]) {
    for (const day of week.days) {
      for (const section of day.sections) {
        for (const exercise of section.exercises) programNames.add(exercise.name)
      }
    }
  }

  const cards = [...programNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name, index) => {
      const matches = getExerciseMatches(name)
      const primary = matches[0]
      const status = primary ? exerciseVideoStatusLabel(primary.videoStatus) : 'Search fallback — source row not embedded yet'
      const equipment = [...new Set(matches.flatMap((item) => item.equipment))].join(', ')
      const alternatives = getApprovedSubstitutions(name, 'Crownforge')
      const category = primary?.roles?.[0] ?? equipment.split(',')[0]?.trim() ?? 'training'
      const filterText = `${name} ${equipment} ${category}`.toLowerCase()
      const filterTags = [
        /barbell|bench press|front squat|back squat|deadlift|clean|snatch|push press|overhead press/.test(filterText) ? 'barbell' : '',
        /kettlebell|\bkb\b/.test(filterText) ? 'kb' : '',
        /sled/.test(filterText) ? 'sled' : '',
        /carry|farmer|suitcase/.test(filterText) ? 'carry' : '',
        /core|trunk|plank|dead bug|pallof|ab wheel|hollow/.test(filterText) ? 'core' : '',
      ].filter(Boolean).join(' ')
      return `<article class="library-card" data-library-card data-search-name="${esc(filterText)}" data-filter-tags="${esc(filterTags)}"><div class="library-thumb"><span>${String(index + 1).padStart(2,'0')}</span><b>⚔</b></div><div class="library-copy"><div class="exercise-eyebrow">${esc(category)}${equipment ? ` • ${esc(equipment)}` : ''}</div><h3>${esc(name)}</h3><p>${esc(status)}${matches.length > 1 ? ` • ${matches.length} mapped movement options` : ''}</p><div class="btn-row"><button class="btn small ghost" data-watch="${esc(name)}">WATCH</button><button class="btn small ghost" data-exercise-info="${esc(name)}">INFO</button><button class="btn small ghost" data-substitute="${esc(primary?.id ?? name)}" data-name="${esc(name)}">SUBSTITUTE${alternatives.length ? ` (${alternatives.length})` : ''}</button></div></div><i>›</i></article>`
    })
    .join('')

  return `<div class="page-head cinematic-head"><div class="page-kicker">Exercise intelligence</div><h1>EXERCISES</h1><p class="muted">${EXERCISE_LIBRARY_SOURCE_TOTAL} active-plan source records • ${APPROVED_SUBSTITUTION_SOURCE_TOTAL} source-approved substitution pairs • all programmed Crownforge + Crown Maintenance names audited against the embedded source library.</p></div>
    <div class="callout"><strong>Program safety:</strong> Watch, Info, and Substitute explain or propose. They never silently rewrite Crownforge.</div>
    <div class="exercise-search-card"><div class="search-wrap"><span>⌕</span><input id="exercise-search" class="exercise-search" placeholder="Search exercises, equipment, or movement…" autocomplete="off"></div><div class="filter-chips" aria-label="Exercise filters"><button class="active" data-exercise-filter="all">All</button><button data-exercise-filter="barbell">Barbell</button><button data-exercise-filter="kb">KB</button><button data-exercise-filter="sled">Sled</button><button data-exercise-filter="carry">Carry</button><button data-exercise-filter="core">Core</button></div><div class="exercise-results"><strong id="exercise-result-count">${programNames.size}</strong><span>programmed movements</span></div></div>
    <div class="exercise-library">${cards}</div><div id="exercise-no-results" class="card empty" hidden>No programmed exercises match this search and filter.</div>`
}function coachPage(): string {
  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  return `<div class="coach-shell">
    <div class="coach-banner"><div class="coach-avatar">♛</div><div><div class="page-kicker">LETMEFLY COACH • ONLINE</div><h1>Your training. Your progression.</h1></div></div>
    <div class="coach-layout">
      <section class="coach-context card"><div class="page-kicker">Current Context</div><h2>${esc(day?.title ?? 'Crownforge')}</h2><div class="context-grid"><div><span>Program</span><strong>${state.selectedProgram === 'crown-maintenance' ? 'Crown Maintenance' : 'Crownforge'}</strong></div><div><span>Position</span><strong>W${state.selectedWeek} • D${state.selectedDay}</strong></div><div><span>Priority</span><strong>Program rules</strong></div><div><span>Session</span><strong>${state.workout ? `${completionStats(state.workout).percent}% logged` : 'Not started'}</strong></div></div><p>${esc(day?.readinessRule ?? 'Preserve the program and train with clean technique.')}</p></section>
      <section class="coach-chat card"><div id="coach-answer" class="coach-message"><div class="coach-message-mark">♛</div><div><span>LETMEFLY COACH</span><h2>${esc(day?.title ?? 'Crownforge')}</h2><p>${esc(day?.readinessRule ?? 'Preserve the program and train with clean technique.')}</p></div></div><div class="quick-prompts"><button data-coach-prompt="What are we doing today?">WHAT ARE WE DOING TODAY?</button><button data-coach-prompt="Can I increase the weight?">CAN I INCREASE THE WEIGHT?</button><button data-coach-prompt="Why am I doing this?">WHY IS THIS HERE?</button><button data-coach-prompt="Give me a substitute.">GIVE ME A SUBSTITUTE</button><button data-coach-prompt="What should I focus on?">WHAT SHOULD I FOCUS ON?</button><button data-coach-prompt="What did I do last time?">WHAT DID I DO LAST TIME?</button></div><div class="coach-composer"><textarea id="coach-question" rows="2" placeholder="Ask your coach anything…"></textarea><button class="btn primary" data-action="ask-coach">ASK</button></div></section>
    </div>
  </div>`
}function profilePage(): string {
  const name = String(state.athlete?.display_name ?? '')
  const snapshot = state.cloudSnapshot
  const vm = snapshot ? toPrivateVaultViewModel(snapshot, name) : null
  return `<div class="page-head cinematic-head"><div class="page-kicker">Private athlete dossier</div><h1>PROFILE</h1><p class="muted">Your identity, training context, and data ownership — private by default.</p></div>
  <section class="profile-hero card"><div class="profile-avatar">${esc((name || 'A').slice(0,1).toUpperCase())}</div><div class="profile-identity"><span>ATHLETE</span><h2>${esc(name || 'Athlete')}</h2><p>Train. Adapt. Improve. Repeat.</p></div><div class="profile-program"><span>CURRENT PROGRAM</span><strong>Crownforge</strong><small>Week ${state.selectedWeek} • Day ${state.selectedDay}</small></div></section>
  <div class="profile-grid">
    <section class="card profile-card"><div class="card-head"><div><div class="page-kicker">Identity</div><h2>Athlete Profile</h2></div><span class="badge mandatory">Private</span></div><div class="field"><label>Display name</label><input id="profile-name" class="input" value="${esc(name)}"></div><button class="btn primary" data-action="save-profile">SAVE PROFILE</button></section>
    <section class="card vault-card"><div class="page-kicker">Private Vault — ${esc(vm?.vaultLabel ?? 'READY')}</div><h2>${esc(vm?.accountLabel ?? name)}</h2><div class="vault-status"><span>CLOUD</span><strong>${esc(vm?.cloudLabel ?? (state.cloud.configured ? 'NOT SIGNED IN' : 'NOT CONFIGURED'))}</strong></div>${vm?.pendingLabel ? `<p class="muted">${esc(vm.pendingLabel)}</p>` : ''}${vm?.conflictLabel ? `<div class="callout danger">${esc(vm.conflictLabel)}</div>` : ''}<div class="btn-row"><button class="btn ghost" data-action="sync-now" ${!state.cloud.configured ? 'disabled' : ''}>SYNC NOW</button>${snapshot?.session ? `<button class="btn ghost" data-action="signout-keep">SIGN OUT — KEEP DATA</button>` : ''}</div></section>
  </div>
  ${state.cloud.configured && !snapshot?.session ? `<section class="card"><div class="page-kicker">Optional cloud</div><h2>Enable Sync / Sign In</h2><div class="form-grid"><div class="field"><label>Email</label><input id="cloud-email" class="input" type="email" placeholder="you@example.com"></div><div class="field"><label>Code</label><input id="cloud-code" class="input" inputmode="numeric" placeholder="6-digit code"></div></div><div class="btn-row"><button class="btn purple" data-action="send-otp-enable">ENABLE SYNC — SEND CODE</button><button class="btn ghost" data-action="send-otp-signin">SIGN IN — SEND CODE</button><button class="btn primary" data-action="verify-otp">VERIFY CODE</button></div></section>` : ''}
  <div class="section-title"><div><div class="page-kicker">Ownership</div><h2>Data & Backups</h2></div></div><section class="card data-card"><p class="muted">JSON is the authoritative restore format. CSV and PDF remain portable convenience exports.</p><div class="data-actions"><button class="action-tile" data-action="backup-json"><span>⇩</span><strong>Full Backup</strong><small>Verified JSON</small></button><button class="action-tile" data-action="export-csv"><span>▦</span><strong>Export CSV</strong><small>Workout history</small></button><button class="action-tile" data-action="export-pdf"><span>▤</span><strong>Print / PDF</strong><small>Portable report</small></button><label class="action-tile" for="restore-file"><span>↥</span><strong>Restore</strong><small>Verified backup</small></label><input id="restore-file" type="file" accept=".json,application/json" hidden></div></section>
  <div class="section-title"><div><div class="page-kicker">Migration</div><h2>Legacy LetMeFly</h2></div></div><section class="card"><p class="muted">Old LetMeFly localStorage is never deleted automatically.</p>${state.legacy ? `<div class="callout warning">Legacy state detected: ${state.legacy.snapshot.candidates.length} candidate key(s), ${state.legacy.plan.unmappedPaths.length} unmapped paths preserved.</div><div class="btn-row"><button class="btn ghost" data-action="download-legacy">DOWNLOAD RAW SNAPSHOT</button><button class="btn primary" data-action="migrate-legacy">MIGRATE SAFELY</button></div>` : '<div class="vault-status"><span>STATUS</span><strong>No legacy migration pending</strong></div>'}</section>
  <div class="section-title"><div><div class="page-kicker">Device Privacy</div><h2>Local Data</h2></div></div><section class="card danger-zone"><div><strong>Remove private data from this device</strong><p>A verified backup is prepared first.</p></div><button class="btn danger" data-action="wipe-device">REMOVE DEVICE DATA</button></section>`
}function morePage(): string {
  return `<div class="page-head cinematic-head"><div class="page-kicker">Everything else</div><h1>MORE</h1><p class="muted">Exercise intelligence, coaching, profile, and data tools.</p></div><div class="more-grid">
    <a class="more-card" href="#/exercises"><span>◫</span><div><strong>Exercises</strong><small>Search, watch, substitute.</small></div><i>›</i></a>
    <a class="more-card" href="#/coach"><span>◉</span><div><strong>Coach</strong><small>Program-aware guidance.</small></div><i>›</i></a>
    <a class="more-card" href="#/profile"><span>●</span><div><strong>Profile</strong><small>Athlete vault and backups.</small></div><i>›</i></a>
    <a class="more-card" href="#/program"><span>▦</span><div><strong>Program</strong><small>Crownforge and Black Crown roadmap.</small></div><i>›</i></a>
  </div><section class="more-brand"><div class="crown-seal">♛</div><strong>LETMEFLY</strong><span>DISCIPLINE BUILDS FREEDOM</span></section>`
}

function onboardingModal(): string {
  return `<div class="modal-backdrop"><div class="modal"><div class="brand"><div class="brand-mark">♛</div><div>LETMEFLY<small>LOCAL-FIRST SETUP</small></div></div><h1 style="margin-top:18px">Build the athlete vault.</h1><p class="muted">No account is required. Your profile and workout history start in private browser storage.</p>${state.legacy ? `<div class="callout warning"><strong>Legacy LetMeFly data detected.</strong><br>${state.legacy.snapshot.candidates.length} browser storage key(s) can be snapshotted and migrated without deleting the original.</div><div class="btn-row" style="margin:12px 0"><button class="btn purple" data-action="migrate-legacy-onboard">Inspect & Migrate Existing Data</button></div><hr style="border-color:var(--line)">` : ''}<div class="field"><label>Display name</label><input id="onboard-name" class="input" placeholder="Athlete name"></div><div class="field" style="margin-top:10px"><label>Default weight unit</label><select id="onboard-unit" class="select"><option value="lb">lb</option><option value="kg">kg</option></select></div><button class="btn primary" style="width:100%;margin-top:14px" data-action="create-athlete">Create Local Athlete</button><p class="source-note" style="margin-top:12px">This rebuilt public shell does not contain personal TMs, bodyweight, goals, or workout history. Those live only in your private vault.</p></div></div>`
}


function openExerciseDemo(programName: string): void {
  const matches = getExerciseMatches(programName)
  if (matches.length === 0) {
    window.open(safeFallbackSearchUrl(programName), '_blank', 'noopener,noreferrer')
    return
  }

  if (matches.length === 1) {
    window.open(matches[0].demoUrl, '_blank', 'noopener,noreferrer')
    return
  }

  showModal(`<div class="page-kicker">Watch Exercise</div><h2>${esc(programName)}</h2><p class="muted">This programmed label contains multiple valid movement options. Choose the movement you are actually performing.</p>${matches.map((record) => `<div class="card"><h3>${esc(record.canonicalName)}</h3><p class="source-note">${esc(exerciseVideoStatusLabel(record.videoStatus))}</p><a class="btn small ghost" href="${esc(record.demoUrl)}" target="_blank" rel="noopener noreferrer">Open Demo</a></div>`).join('')}<button class="btn primary" data-close-modal style="margin-top:12px">Close</button>`)
}

function showExerciseInfo(programName: string): void {
  const matches = getExerciseMatches(programName)
  if (!matches.length) {
    showModal(`<div class="page-kicker">Exercise Intelligence</div><h2>${esc(programName)}</h2><div class="callout warning">The source workbook contains this active-plan library, but this specific row has not been embedded into the rebuilt TypeScript catalog yet. Watch Exercise will use an explicit search fallback until that row is imported.</div><button class="btn primary" data-close-modal style="margin-top:12px">Close</button>`)
    return
  }

  showModal(`<div class="page-kicker">Exercise Intelligence</div><h2>${esc(programName)}</h2>${matches.map((record) => `<div class="card"><h3>${esc(record.canonicalName)}</h3><p class="muted"><strong>Video:</strong> ${esc(exerciseVideoStatusLabel(record.videoStatus))}</p>${record.equipment.length ? `<p class="muted"><strong>Equipment:</strong> ${esc(record.equipment.join(', '))}</p>` : ''}${record.roles.length ? `<p class="muted"><strong>Source role:</strong> ${esc(record.roles.join(', '))}</p>` : ''}<a class="btn small ghost" href="${esc(record.demoUrl)}" target="_blank" rel="noopener noreferrer">Watch Exercise</a></div>`).join('')}<button class="btn primary" data-close-modal style="margin-top:12px">Close</button>`)
}

function showExerciseSubstitutions(programName: string): void {
  const options = getApprovedSubstitutions(programName, 'Crownforge')
  showModal(`<div class="page-kicker">Source-Approved Substitution Coach</div><h2>${esc(programName)}</h2>${options.length ? options.map((option) => {
    const alternative = getPrimaryExerciseMatch(option.alternative)
    return `<div class="card"><h3>${esc(option.alternative)}</h3><p class="muted">${esc(option.loadingAdjustment)}</p><p class="source-note"><strong>Approval:</strong> ${esc(option.approvalSource)} • ${esc(option.weeksSeen)}</p>${alternative ? `<a class="btn small ghost" href="${esc(alternative.demoUrl)}" target="_blank" rel="noopener noreferrer">Watch Alternative</a>` : ''}</div>`
  }).join('') : `<div class="callout warning">No source-approved Crownforge substitution is embedded for this movement. Do not swap it merely because another exercise trains the same muscle. Coach Mode must preserve the programmed role, stimulus, equipment context, and training phase.</div>`}<div class="callout" style="margin-top:12px"><strong>Program protection:</strong> reviewing a substitute does not change the public Crownforge program. Applying one later must create a private, intentional coaching/substitution record.</div><button class="btn primary" data-close-modal style="margin-top:12px">Close</button>`)
}

function bindCommonEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-action="go-train"]').forEach((el) => el.addEventListener('click', () => location.hash = '#/train'))
  document.querySelectorAll<HTMLElement>('[data-action="go-program"]').forEach((el) => el.addEventListener('click', () => location.hash = '#/program'))
  document.querySelectorAll<HTMLElement>('[data-action="go-coach"]').forEach((el) => el.addEventListener('click', () => location.hash = '#/coach'))
  document.querySelectorAll<HTMLElement>('[data-watch]').forEach((el) => el.addEventListener('click', () => openExerciseDemo(el.dataset.watch ?? '')))
  document.querySelectorAll<HTMLElement>('[data-exercise-info]').forEach((el) => el.addEventListener('click', () => showExerciseInfo(el.dataset.exerciseInfo ?? '')))
  document.querySelectorAll<HTMLElement>('[data-substitute]').forEach((el) => el.addEventListener('click', () => showExerciseSubstitutions(el.dataset.name ?? el.dataset.substitute ?? '')))
}

function bindRouteEvents(): void {
  if (!state.athlete) {
    document.querySelector('[data-action="create-athlete"]')?.addEventListener('click', createAthleteFromOnboarding)
    document.querySelector('[data-action="migrate-legacy-onboard"]')?.addEventListener('click', migrateLegacy)
    return
  }
  if (state.route === 'home') void hydrateHomeReadiness()
  if (state.route === 'train') bindTrainEvents()
  if (state.route === 'program') bindProgramEvents()
  if (state.route === 'progress') void renderProgressAsync()
  if (state.route === 'exercises') bindExerciseEvents()
  if (state.route === 'coach') bindCoachEvents()
  if (state.route === 'profile') bindProfileEvents()
}

function bindTrainEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-day]').forEach((el) => el.addEventListener('click', async () => {
    state.selectedDay = Number(el.dataset.day)
    await refreshWorkout()
    render()
  }))
  bindSwipeNavigation()
  document.querySelectorAll('[data-action="save-readiness"]').forEach((el) => el.addEventListener('click', saveReadinessFromForm))
  document.querySelectorAll('[data-action="start-workout"]').forEach((el) => el.addEventListener('click', startSelectedWorkout))
  document.querySelectorAll<HTMLElement>('[data-action="toggle-set"]').forEach((el) => el.addEventListener('click', toggleSetFromRow))
  document.querySelector('[data-action="complete-workout"]')?.addEventListener('click', completeSelectedWorkout)
  document.querySelector('[data-action="sync-now"]')?.addEventListener('click', syncNow)
}

function bindSwipeNavigation(): void {
  const viewport = document.querySelector<HTMLElement>('#swipe-viewport')
  if (!viewport) return
  const pages = [...viewport.querySelectorAll<HTMLElement>('.swipe-page')]
  const track = [...document.querySelectorAll<HTMLButtonElement>('[data-session-index]')]
  const stepButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-session-step]')]
  const position = document.querySelector<HTMLElement>('#session-position')
  const label = document.querySelector<HTMLElement>('#session-label')
  if (!pages.length) return

  let activeIndex = 0
  let frame = 0
  const sectionLabel = (index: number): string => index === 0 ? 'READINESS' : index === pages.length - 1 ? 'REVIEW' : `BLOCK ${String.fromCharCode(64 + index)}`
  const setActive = (index: number): void => {
    activeIndex = Math.max(0, Math.min(pages.length - 1, index))
    track.forEach((item, itemIndex) => {
      item.classList.toggle('active', itemIndex === activeIndex)
      item.setAttribute('aria-current', itemIndex === activeIndex ? 'step' : 'false')
    })
    if (position) position.textContent = `${activeIndex + 1} / ${pages.length}`
    if (label) label.textContent = sectionLabel(activeIndex)
    stepButtons.forEach((button) => {
      const direction = Number(button.dataset.sessionStep)
      button.disabled = direction < 0 ? activeIndex === 0 : activeIndex === pages.length - 1
    })
  }
  const goTo = (index: number): void => {
    const next = Math.max(0, Math.min(pages.length - 1, index))
    pages[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    setActive(next)
  }

  track.forEach((button) => button.addEventListener('click', () => goTo(Number(button.dataset.sessionIndex ?? 0))))
  stepButtons.forEach((button) => button.addEventListener('click', () => goTo(activeIndex + Number(button.dataset.sessionStep ?? 0))))
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const center = viewport.scrollLeft + viewport.clientWidth / 2
      let nearest = 0
      let distance = Number.POSITIVE_INFINITY
      pages.forEach((page, index) => {
        const pageCenter = page.offsetLeft + page.offsetWidth / 2
        const nextDistance = Math.abs(pageCenter - center)
        if (nextDistance < distance) { distance = nextDistance; nearest = index }
      })
      setActive(nearest)
    })
  }, { passive: true })
  setActive(0)
}

async function hydrateHomeReadiness(): Promise<void> {
  if (!state.athlete || state.route !== 'home') return
  const row = await latestReadiness(state.athlete.id)
  if (!row || state.route !== 'home') return
  const sleepQuality = Number(row.sleep_quality ?? 0)
  const energy = Number(row.energy ?? 0)
  const soreness = Number(row.soreness ?? 0)
  const stress = Number(row.stress ?? 0)
  const input = { sleepQuality, energy, soreness, stress }
  const color = readinessColor(input)
  const setText = (selector: string, value: number): void => {
    const element = document.querySelector<HTMLElement>(selector)
    if (element) element.textContent = value > 0 ? `${value}/5` : '—'
  }
  setText('#home-readiness-sleep', sleepQuality)
  setText('#home-readiness-energy', energy)
  setText('#home-readiness-soreness', soreness)
  const status = document.querySelector<HTMLElement>('#home-readiness-status')
  if (status) status.className = `status-dot ${color}`
  const note = document.querySelector<HTMLElement>('#home-readiness-note')
  if (note) {
    const recorded = String(row.recorded_at ?? '').slice(0, 10)
    note.textContent = `${color.toUpperCase()} readiness${recorded ? ` • ${recorded}` : ''}. Readiness stays inside governed auto-regulation limits and never rewrites Crownforge.`
  }
}

function bindProgramEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-open-day]').forEach((el) => el.addEventListener('click', async () => {
    state.selectedProgram = (el.dataset.openProgram === 'crown-maintenance' ? 'crown-maintenance' : 'crownforge')
    state.selectedWeek = Number(el.dataset.openWeek ?? 1)
    state.selectedDay = Number(el.dataset.openDay)
    await refreshWorkout()
    location.hash = '#/train'
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-jump-week]').forEach((button) => button.addEventListener('click', () => {
    const week = Number(button.dataset.jumpWeek ?? 1)
    document.querySelector<HTMLElement>(`#program-week-${week}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelectorAll<HTMLButtonElement>('[data-jump-week]').forEach((item) => item.classList.toggle('active', item === button))
  }))
}

function bindProgressEvents(): void {
  document.querySelector('[data-action="save-tms"]')?.addEventListener('click', async () => {
    if (!state.athlete) return
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.tm-input')]
    let count = 0
    for (const input of inputs) {
      const value = Number(input.value)
      if (!Number.isFinite(value) || value <= 0) continue
      const key = input.dataset.tmKey!
      const unit = document.querySelector<HTMLSelectElement>(`[data-tm-unit="${CSS.escape(key)}"]`)?.value === 'kg' ? 'kg' : 'lb'
      await setTrainingMax(state.athlete.id, key, value, unit)
      count++
    }
    state.cloud.syncSoon()
    showToast(`${count} TM record${count === 1 ? '' : 's'} saved locally`)
    void renderProgressAsync()
  })
}

function bindExerciseEvents(): void {
  const search = document.querySelector<HTMLInputElement>('#exercise-search')
  const filters = [...document.querySelectorAll<HTMLButtonElement>('[data-exercise-filter]')]
  const cards = [...document.querySelectorAll<HTMLElement>('[data-library-card]')]
  const resultCount = document.querySelector<HTMLElement>('#exercise-result-count')
  const noResults = document.querySelector<HTMLElement>('#exercise-no-results')
  let activeFilter = 'all'

  const applyFilters = (): void => {
    const query = search?.value.trim().toLowerCase() ?? ''
    let visible = 0
    cards.forEach((card) => {
      const matchesSearch = !query || (card.dataset.searchName ?? '').includes(query)
      const tags = (card.dataset.filterTags ?? '').split(/\s+/).filter(Boolean)
      const matchesFilter = activeFilter === 'all' || tags.includes(activeFilter)
      card.hidden = !(matchesSearch && matchesFilter)
      if (!card.hidden) visible++
    })
    if (resultCount) resultCount.textContent = String(visible)
    if (noResults) noResults.hidden = visible !== 0
  }

  search?.addEventListener('input', applyFilters)
  filters.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.exerciseFilter ?? 'all'
    filters.forEach((item) => {
      const active = item === button
      item.classList.toggle('active', active)
      item.setAttribute('aria-pressed', String(active))
    })
    applyFilters()
  }))
  applyFilters()
  // Watch, Info, and Substitute actions are bound by bindCommonEvents so the
  // same exercise intelligence works in preview cards, active workout cards,
  // and the full library.
}

function bindCoachEvents(): void {
  document.querySelector('[data-action="ask-coach"]')?.addEventListener('click', () => void answerCoach())
  const input = document.querySelector<HTMLTextAreaElement>('#coach-question')
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void answerCoach() }
  })
  document.querySelectorAll<HTMLElement>('[data-coach-prompt]').forEach((el) => el.addEventListener('click', () => {
    if (input) input.value = el.dataset.coachPrompt ?? ''
    void answerCoach()
  }))
}

function bindProfileEvents(): void {
  document.querySelector('[data-action="save-profile"]')?.addEventListener('click', async () => {
    if (!state.athlete) return
    const name = document.querySelector<HTMLInputElement>('#profile-name')?.value ?? ''
    await updateAthleteName(state.athlete.id, name)
    state.athlete = await getActiveAthlete()
    state.cloud.syncSoon()
    showToast('Profile saved locally')
    render()
  })
  document.querySelector('[data-action="send-otp-enable"]')?.addEventListener('click', () => sendOtp('enable-sync'))
  document.querySelector('[data-action="send-otp-signin"]')?.addEventListener('click', () => sendOtp('sign-in'))
  document.querySelector('[data-action="verify-otp"]')?.addEventListener('click', verifyOtp)
  document.querySelector('[data-action="sync-now"]')?.addEventListener('click', syncNow)
  document.querySelector('[data-action="signout-keep"]')?.addEventListener('click', async () => { await state.cloud.vault.signOutKeepOfflineData(); showToast('Signed out — offline data kept'); render() })
  document.querySelector('[data-action="backup-json"]')?.addEventListener('click', backupJson)
  document.querySelector('[data-action="export-csv"]')?.addEventListener('click', exportCsv)
  document.querySelector('[data-action="export-pdf"]')?.addEventListener('click', exportPdf)
  document.querySelector<HTMLInputElement>('#restore-file')?.addEventListener('change', restoreFileSelected)
  document.querySelector('[data-action="download-legacy"]')?.addEventListener('click', () => { if (state.legacy) downloadRawLegacyBackup(state.legacy.snapshot) })
  document.querySelector('[data-action="migrate-legacy"]')?.addEventListener('click', migrateLegacy)
  document.querySelector('[data-action="wipe-device"]')?.addEventListener('click', wipeDevice)
}

async function createAthleteFromOnboarding(): Promise<void> {
  const name = document.querySelector<HTMLInputElement>('#onboard-name')?.value ?? ''
  const unit = document.querySelector<HTMLSelectElement>('#onboard-unit')?.value === 'kg' ? 'kg' : 'lb'
  if (!name.trim()) return showToast('Enter an athlete name')
  state.athlete = await createLocalAthlete({ displayName: name, weightUnit: unit })
  state.programInstance = await getCurrentProgramInstance(state.athlete.id)
  render()
  if (state.cloud.configured) void state.cloud.start().catch(console.warn)
}

async function migrateLegacy(): Promise<void> {
  if (!state.legacy) return
  const report = migrationReportText(state.legacy.snapshot, state.legacy.plan)
  const warning = state.legacy.plan.unmappedPaths.length
    ? `\n\n${state.legacy.plan.unmappedPaths.length} unmapped value paths will remain preserved in the raw migration backup.`
    : ''
  if (!confirm(`Migrate detected legacy LetMeFly data into IndexedDB?\n\nCanonical candidates: ${state.legacy.plan.candidates.length}${warning}\n\nThe old localStorage copy will NOT be deleted.`)) return
  console.info(report)
  const result = await runSafeLegacyMigration(state.legacy)
  if (!result.verified) throw new Error('Legacy migration did not verify')
  state.athlete = await getActiveAthlete()
  if (state.athlete) state.programInstance = await getCurrentProgramInstance(state.athlete.id)
  state.legacy = null
  await refreshWorkout()
  showToast('Legacy data migrated and verified')
  render()
}

async function saveReadinessFromForm(): Promise<void> {
  if (!state.athlete) return
  const get = (label: string) =>
    Number(document.querySelector<HTMLInputElement>(`input[name="readiness-${slug(label)}"]:checked`)?.value ?? 3)
  const input = {
    sleepQuality: get('Sleep quality'),
    energy: get('Energy'),
    soreness: get('Soreness'),
    stress: get('Stress'),
    notes: document.querySelector<HTMLTextAreaElement>('#readiness-notes')?.value ?? null,
  }
  await saveReadiness(state.athlete.id, input)
  const color = readinessColor(input)
  state.cloud.syncSoon()
  showToast(`Readiness saved • ${color.toUpperCase()}`)
}

async function startSelectedWorkout(): Promise<void> {
  if (!state.athlete) return
  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  if (!day) return
  state.workout = await startWorkout(state.athlete.id, state.programInstance?.id ?? null, state.selectedProgram, state.selectedWeek, day)
  state.cloud.syncSoon()
  showToast('Workout saved locally • cloud sync pending if needed')
  render()
}

async function toggleSetFromRow(event: Event): Promise<void> {
  if (!state.athlete) return
  const button = event.currentTarget as HTMLButtonElement
  const row = button.closest<HTMLElement>('[data-set-id]')
  if (!row) return
  const setId = row.dataset.setId!
  const alreadyDone = button.classList.contains('done')
  if (alreadyDone) {
    await uncompleteSet(state.athlete.id, setId)
    button.classList.remove('done'); button.textContent = '○'
  } else {
    const repsRaw = row.querySelector<HTMLInputElement>('.reps-input')?.value ?? ''
    const loadRaw = row.querySelector<HTMLInputElement>('.load-input')?.value ?? ''
    const rpeRaw = row.querySelector<HTMLInputElement>('.rpe-input')?.value ?? ''
    await logSet(state.athlete.id, setId, {
      reps: repsRaw === '' ? null : Number(repsRaw),
      loadValue: loadRaw === '' ? null : Number(loadRaw),
      loadUnit: loadRaw === '' ? null : 'lb',
      rpe: rpeRaw === '' ? null : Number(rpeRaw),
    })
    button.classList.add('done'); button.textContent = '✓'
  }
  await refreshWorkout()
  state.cloud.syncSoon()
  showToast(alreadyDone ? 'Set reopened locally' : 'Set saved locally')
}

async function completeSelectedWorkout(): Promise<void> {
  if (!state.athlete || !state.workout) return
  const stats = completionStats(state.workout)
  if (stats.done < stats.total && !confirm(`${stats.total - stats.done} set(s) are not logged. Complete the workout anyway? Skipped/optional work will remain accurately incomplete in history.`)) return
  await completeWorkout(state.athlete.id, state.workout.session.id)
  await refreshWorkout()
  state.cloud.syncSoon()
  showToast('Workout completed locally')
  render()
}

async function sendOtp(purpose: 'enable-sync' | 'sign-in'): Promise<void> {
  const email = document.querySelector<HTMLInputElement>('#cloud-email')?.value ?? ''
  if (!email.trim()) return showToast('Enter your email')
  await state.cloud.vault.requestCode(email, purpose)
  showToast('Sign-in code sent')
}

async function verifyOtp(): Promise<void> {
  const email = document.querySelector<HTMLInputElement>('#cloud-email')?.value ?? ''
  const code = document.querySelector<HTMLInputElement>('#cloud-code')?.value ?? ''
  if (!email || !code) return showToast('Enter email and code')
  const decision = await state.cloud.vault.verifyCode(email, code)
  state.cloudSnapshot = state.cloud.vault.snapshot
  showToast(decision.kind === 'manual-choice-required' ? 'Local/cloud athlete mismatch — automatic merge blocked' : 'Cloud account verified')
  render()
}

async function syncNow(): Promise<void> {
  if (!state.cloud.configured) return showToast('Cloud is not configured')
  try {
    await state.cloud.vault.syncNow()
    state.cloudSnapshot = state.cloud.vault.snapshot
    showToast('Sync check complete')
    updateSyncPill()
  } catch (error) {
    showToast(`Saved locally • cloud pending: ${errorMessage(error)}`)
  }
}

async function backupJson(): Promise<void> {
  if (!state.athlete) return
  const backup = await createAthleteBackup(state.athlete.id, APP_VERSION)
  downloadBackupFile(backup)
  showToast('Verified full backup created')
}

async function exportCsv(): Promise<void> {
  if (!state.athlete) return
  const backup = await createAthleteBackup(state.athlete.id, APP_VERSION)
  downloadCsvExports(backup)
  showToast('CSV exports created')
}

async function exportPdf(): Promise<void> {
  if (!state.athlete) return
  const backup = await createAthleteBackup(state.athlete.id, APP_VERSION)
  openPrintableReport(backup)
}

async function restoreFileSelected(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  const preview = await previewRestoreText(text)
  if (!preview.validation.valid) {
    return showModal(`<div class="page-kicker">Restore blocked</div><h2>Backup validation failed</h2>${preview.validation.issues.map((i) => `<div class="callout danger">${esc(i.code)} — ${esc(i.message)}</div>`).join('')}<button class="btn primary" data-close-modal style="margin-top:12px">Close</button>`)
  }
  const mode = confirm(`Verified LetMeFly backup for ${preview.athleteName}.\n\nOK = Full device recovery (preserve sync cursor/pending work)\nCancel = Portable import (reset cloud relationship).`) ? 'full-device-recovery' : 'portable-import'
  if (!confirm(`Restore ${preview.athleteName} using ${mode}? Current local athlete will be backed up before replacement.`)) return
  const result = await restoreFromBackup(preview.backup, mode, APP_VERSION)
  if (!result.verification.valid) throw new Error('Post-restore verification failed')
  state.athlete = await getActiveAthlete()
  state.programInstance = state.athlete ? await getCurrentProgramInstance(state.athlete.id) : null
  await refreshWorkout()
  showToast('Restore verified')
  render()
}

async function wipeDevice(): Promise<void> {
  if (!confirm('Remove all private LetMeFly data from THIS DEVICE? LetMeFly will create a verified full backup first.')) return
  if (state.athlete) {
    const backup = await createAthleteBackup(state.athlete.id, APP_VERSION)
    downloadBackupFile(backup)
  }
  if (!confirm('Verified backup prepared. Continue removing private data from this device?')) return
  if (state.cloud.configured) await state.cloud.vault.removePrivateDataFromThisDevice()
  else {
    const { wipePrivateDatabase } = await import('./db/local-db')
    await wipePrivateDatabase()
  }
  location.reload()
}

async function answerCoach(): Promise<void> {
  const question = (document.querySelector<HTMLTextAreaElement>('#coach-question')?.value ?? '').trim().toLowerCase()
  const day = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  let answer = day?.readinessRule ?? 'Preserve the current program and training quality.'
  let heading = 'Coach answer'
  if (/what.*today|doing today|workout/.test(question)) {
    heading = day?.title ?? 'Today'
    answer = day ? `${day.role} ${day.readinessRule}` : 'No program day is loaded.'
  } else if (/why/.test(question)) {
    heading = 'Why this session exists'
    answer = day ? `${day.role} The session order protects the highest-value adaptation first; conditional and optional work is removable before primary work.` : answer
  } else if (/increase|more weight|heavier/.test(question)) {
    heading = 'Load decision'
    answer = 'Do not increase a governed programmed load just for variety. Exact programmed loads remain the authority. A change should come from the program rule, a verified TM/test update, or an intentional coaching decision.'
  } else if (/focus|cue|set/.test(question)) {
    heading = 'Set focus'
    answer = day?.day === 1 ? 'Preserve front-squat position and bench bar path. Take full rest before barbell sets; the circuit never forces a rushed primary set.' : day?.day === 4 ? 'Own the hinge position and bar speed. Stop before the deadlift becomes a grinder; cut extra yoke/trunk work before degrading the main pull.' : 'Use clean technique, preserve the movement purpose, and stop optional volume before it interferes with the next protected work.'
  } else if (/last time|previous workout|did before/.test(question)) {
    heading = 'Previous training'
    if (!state.athlete) answer = 'No athlete profile is loaded.'
    else {
      const history = await recentWorkoutSessions(state.athlete.id, 8)
      const previous = history.find((item) => item.id !== state.workout?.session.id) ?? history[0]
      answer = previous
        ? `Your most recent recorded session in the current history window was ${String(previous.workout_name ?? 'Workout')} on ${String(previous.started_at ?? previous.scheduled_for ?? '').slice(0, 10)} with status ${String(previous.status ?? 'recorded')}. For set-level comparison, use the logged exercise history rather than changing today's prescription from memory.`
        : 'There is no previous workout in the current local history window yet.'
    }
  } else if (/substitut/.test(question)) {
    heading = 'Substitution rule'
    answer = 'A substitute must preserve the programmed role, movement pattern, stimulus, equipment context, phase, and your limitations. Same-muscle alone is not enough.'
  }
  const panel = document.querySelector('#coach-answer')
  if (panel) panel.innerHTML = `<div class="page-kicker">Coach Mode</div><h2>${esc(heading)}</h2><p>${esc(answer)}</p>`
}

function completionStats(workout: WorkoutBundle): { done: number; total: number; percent: number } {
  const sets = workout.exercises.flatMap((x) => x.sets)
  const done = sets.filter((s) => Boolean(s.completed)).length
  return { done, total: sets.length, percent: sets.length ? Math.round(done / sets.length * 100) : 0 }
}

function updateSyncPill(): void {
  const pill = document.querySelector<HTMLElement>('#sync-pill')
  if (!pill) return
  if (!state.cloud.configured) {
    pill.innerHTML = '<i class="dot purple"></i>Local only'
    return
  }
  if (!state.cloudSnapshot) {
    pill.innerHTML = '<i class="dot yellow"></i>Cloud ready'
    return
  }
  const vm = toPrivateVaultViewModel(state.cloudSnapshot, String(state.athlete?.display_name ?? 'Athlete'))
  const cls = vm.cloudLabel === 'SYNCED' ? 'green' : vm.cloudLabel === 'OFFLINE' ? 'yellow' : vm.cloudLabel.includes('REQUIRED') || vm.cloudLabel.includes('CONFLICT') ? 'red' : 'purple'
  pill.innerHTML = `<i class="dot ${cls}"></i>${esc(vm.cloudLabel)}`
}

function showToast(message: string): void {
  state.toast = message
  const existing = document.querySelector('.toast')
  if (existing) existing.textContent = message
  else document.body.insertAdjacentHTML('beforeend', `<div class="toast">${esc(message)}</div>`)
  window.setTimeout(() => {
    state.toast = null
    document.querySelector('.toast')?.remove()
  }, 2800)
}

function showModal(content: string): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'modal-backdrop'
  wrapper.innerHTML = `<div class="modal">${content}</div>`
  document.body.appendChild(wrapper)
  wrapper.querySelector('[data-close-modal]')?.addEventListener('click', () => wrapper.remove())
  wrapper.addEventListener('click', (event) => { if (event.target === wrapper) wrapper.remove() })
}

function routeFromHash(): Route {
  const value = location.hash.replace(/^#\//, '') as Route
  return ['home','train','program','progress','exercises','coach','profile','more'].includes(value) ? value : 'home'
}

function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/service-worker.js').catch(console.warn))
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function esc(value: string): string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') }
