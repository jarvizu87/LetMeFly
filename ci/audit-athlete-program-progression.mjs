#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-athlete-program-progression.mjs <target-source-dir>')
  process.exit(2)
}

const read = (relative) => fs.readFileSync(path.join(target, relative), 'utf8')
const progression = read('src/services/program-progression-service.ts')
const workout = read('src/services/workout-service.ts')
const main = read('src/main.ts')
const athlete = read('src/services/athlete-service.ts')

const checks = new Map([
  ['private progression service exists', fs.existsSync(path.join(target, 'src/services/program-progression-service.ts'))],
  ['Green entry is 90%', progression.includes("if (color === 'green') return 0.9")],
  ['Yellow entry is 87.5%', progression.includes("if (color === 'yellow') return 0.875")],
  ['Red main-lift entry blocks activation', progression.includes('Red entry status delays activation for:')],
  ['entry TM rounds nearest 5', progression.includes('roundNearest5(normalized[key].verified1RmLb * factor)')],
  ['Box Squat derives from approved Back Squat TM', progression.includes("approved['box-squat'] = roundDown5(approved['back-squat'] * 0.9)")],
  ['OHP can carry current working reference', progression.includes("ohpSource = 'carry'") && progression.includes("latestTms['overhead-press']")],
  ['missing OHP reference never fabricates load', progression.includes('Black Crown needs an OHP working reference')],
  ['Crownforge transitions only to Maintenance', progression.includes("program_key: 'crown-maintenance'") && progression.includes('crownforge-complete-maintenance-start')],
  ['Maintenance opens explicit Black Crown gate', progression.includes("current_phase_key: 'black-crown-entry'") && progression.includes('black-crown-entry-gate-opened')],
  ['Black Crown activation requires Maintenance handoff', progression.includes('Black Crown entry requires the active Crown Maintenance handoff')],
  ['cross-program manual reposition is blocked', progression.includes('Cross-program repositioning is blocked. Complete the governed handoff instead.')],
  ['same-program reposition is evented', progression.includes('program-position-repositioned')],
  ['program position auto-advances from source structure', progression.includes('function nextPosition') && progression.includes('definition.weekData')],
  ['Black Crown completion invents no next program', progression.includes('No next program was invented.')],
  ['workout start resolves Black Crown private TMs', workout.includes("programKey === 'black-crown' ? await getLatestTrainingMaxes(athleteId) : {}")],
  ['percentage load refs resolve privately', workout.includes("programmed.loadReference?.startsWith('black-crown:tm:')")],
  ['Power Clean uses saved Clean TM alias', workout.includes("'power-clean': 'clean'")],
  ['unresolved TMs remain null', workout.includes('if (!row) return { value: null, unit: null, tmKey, tmValue: null, tmUnit: null }')],
  ['Black Crown percentage loads round up by default', workout.includes("programmed.rounding === 'down-5'") && workout.includes('Math.ceil(raw / 5) * 5')],
  ['resolved private load provenance is snapshotted', workout.includes('resolvedTrainingMaxKey') && workout.includes('resolvedTrainingMaxValue')],
  ['runtime hydrates selection from private program instance', main.includes('hydrateSelectedPositionFromProgramInstance()') && main.includes('positionFromProgramInstance(state.programInstance)')],
  ['home no longer uses dated public calendar as current athlete state', main.includes('const homeProgram: PublicProgramKey = state.selectedProgram')],
  ['preview workout starts are blocked', main.includes('Preview only — make this your current position before starting')],
  ['intentional current-position control exists', main.includes('MAKE CURRENT POSITION') && main.includes('setIntentionalProgramPosition')],
  ['Black Crown entry UI is private athlete gate', main.includes('BLACK CROWN ENTRY GATE') && main.includes('CALCULATE & ACTIVATE BLACK CROWN')],
  ['workout completion advances private program', main.includes('advanceProgramAfterWorkout(state.athlete.id, completedProgram, completedWeek, completedDay)')],
  ['new athlete start date is not hard-coded', athlete.includes("started_on: new Date().toISOString().slice(0, 10)")],
  ['no legacy fixed athlete start date remains', !athlete.includes("started_on: '2026-09-07'")],
])

const forbiddenPrivateValues = [
  /JP\b/i,
  /joseph/i,
  /front.?squat\s*[:=]\s*160/i,
  /bench\s*[:=]\s*185/i,
  /deadlift\s*[:=]\s*200/i,
  /bodyweight\s*[:=]\s*\d+/i,
]
const logicBundle = `${progression}\n${workout}`
checks.set('progression logic contains no athlete-specific seeded values', forbiddenPrivateValues.every((pattern) => !pattern.test(logicBundle)))

let failed = 0
for (const [label, ok] of checks) {
  console.log(`athlete progression ${label}: ${ok ? 'PASS' : 'FAIL'}`)
  if (!ok) failed += 1
}
if (failed) {
  console.error(`Athlete progression audit failed: ${failed} check(s)`) 
  process.exit(1)
}
console.log('LetMeFly athlete program progression audit: PASS')
