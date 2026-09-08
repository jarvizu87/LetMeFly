#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const fail = (message) => {
  console.error(`Black Crown v2.1 audit: FAIL — ${message}`)
  process.exit(1)
}
const read = (rel) => {
  const full = path.join(target, rel)
  if (!fs.existsSync(full)) fail(`missing ${rel}`)
  return fs.readFileSync(full, 'utf8')
}
const assert = (value, message) => { if (!value) fail(message) }

function parseSourceWeek(week) {
  const text = read(`src/programs/black-crown/source-weeks/week-${String(week).padStart(2, '0')}.ts`)
  const marker = text.indexOf('= {')
  const end = text.lastIndexOf('} satisfies BlackCrownSourceWeek')
  if (marker < 0 || end < 0) fail(`cannot parse source week ${week}`)
  return { text, value: vm.runInNewContext(`(${text.slice(marker + 2, end + 1)})`, Object.create(null), { timeout: 1000 }) }
}

function parseRuntimeWeeks() {
  const text = read('src/programs/black-crown/weeks.ts')
  const marker = text.indexOf('= [')
  const end = text.lastIndexOf(']\n')
  if (marker < 0 || end < 0) fail('cannot parse runtime weeks')
  return vm.runInNewContext(`(${text.slice(marker + 2, end + 1)})`, Object.create(null), { timeout: 2000 })
}

const marker = JSON.parse(read('.black-crown-v2-1-glute-specialization.json'))
assert(marker.version === 'v2.1' && marker.baseVersion === 'v2.0', 'revision marker version mismatch')
assert(JSON.stringify(marker.affectedWeeks) === JSON.stringify([25, 26, 27, 28, 29]), 'affected week scope drift')

const metadata = read('src/programs/black-crown/metadata.ts')
const rules = read('src/programs/black-crown/rules.ts')
const library = read('src/data/exercise-library.ts')
assert(metadata.includes("version: 'v2.1'"), 'metadata does not expose v2.1')
assert(metadata.includes('v2.1 lateral-glute amendment'), 'metadata provenance missing v2.1 amendment')
assert(rules.includes('Machine Hip Abduction 2x15–25 at RPE 7–8'), 'v2.1 source note missing hip-abduction prescription')
assert(rules.includes('Seated Band Hip Abduction, then Mini-Band Lateral Walk'), 'v2.1 fallback hierarchy missing')
assert(library.includes("fallback('Machine Hip Abduction'"), 'Machine Hip Abduction missing from exercise library')
assert(library.includes("fallback('Seated Band Hip Abduction'"), 'Seated Band Hip Abduction missing from exercise library')

const runtimeWeeks = parseRuntimeWeeks()
assert(Array.isArray(runtimeWeeks) && runtimeWeeks.length === 54, 'runtime week count changed')
let sessions = 0
let strictOhp = 0
let affectedMachineExercises = 0

for (let week = 1; week <= 54; week += 1) {
  const source = parseSourceWeek(week)
  const runtime = runtimeWeeks[week - 1]
  assert(runtime.week === week, `runtime week ${week} mismatch`)
  assert(runtime.days.length === 5, `week ${week} session count changed`)
  sessions += runtime.days.length

  for (const day of runtime.days) {
    for (const section of day.sections ?? []) {
      for (const exercise of section.exercises ?? []) {
        if (exercise.name === 'Overhead Press' && /STRICT OHP/i.test(section.title)) strictOhp += 1
      }
    }
  }

  if (week >= 25 && week <= 29) {
    assert(source.text.includes('v2.1 intentional glute-specialization amendment'), `W${week} missing v2.1 amendment note`)
    assert(source.text.includes('Lat Pulldown 2–3x8–10 + Machine Hip Abduction 2x15–25 RPE7–8 — 45–60 sec rest'), `W${week} missing exact v2.1 Day-5 replacement`)
    assert(!source.text.includes('No additional loaded glute slot; weekly roles already supplied by D1 hip thrust/lunge + D3 deadlift'), `W${week} retained superseded no-extra-glute statement`)
    assert(!source.text.includes('Lat Pulldown 2–3x8–10 + Chest-Supported Row 2x8–10'), `W${week} retained superseded secondary row slot`)

    const day5 = runtime.days.find((day) => day.day === 5)
    assert(day5, `W${week} missing Day 5`)
    const exercises = day5.sections.flatMap((section) => section.exercises ?? [])
    const machine = exercises.filter((exercise) => exercise.name === 'Machine Hip Abduction')
    const rows = exercises.filter((exercise) => exercise.name === 'Chest-Supported Row')
    const pulldowns = exercises.filter((exercise) => exercise.name === 'Lat Pulldown')
    assert(machine.length === 1, `W${week} Day 5 expected one Machine Hip Abduction exercise, found ${machine.length}`)
    assert(rows.length === 1, `W${week} Day 5 should retain only the primary Chest-Supported Row, found ${rows.length}`)
    assert(pulldowns.length >= 1, `W${week} Day 5 lost Lat Pulldown support`)
    assert(machine[0].sets?.length === 2, `W${week} Machine Hip Abduction set count is not 2`)
    for (const set of machine[0].sets) {
      assert(String(set.reps) === '15-25', `W${week} Machine Hip Abduction reps drifted: ${set.reps}`)
      assert(String(set.rpe) === '7–8' || String(set.rpe) === '7-8', `W${week} Machine Hip Abduction RPE drifted: ${set.rpe}`)
    }
    assert(machine[0].rest === '45–60 sec', `W${week} Machine Hip Abduction rest drifted`)
    affectedMachineExercises += machine.length
  } else if (week !== 30) {
    assert(!source.text.includes('v2.1 intentional glute-specialization amendment'), `W${week} was changed outside v2.1 scope`)
    assert(!source.text.includes('Machine Hip Abduction 2x15–25'), `W${week} received out-of-scope hip-abduction work`)
  }
}

assert(sessions === 270, `session total changed to ${sessions}`)
assert(strictOhp === 42, `Strict OHP exposure count changed to ${strictOhp}`)
assert(affectedMachineExercises === 5, `expected 5 affected Machine Hip Abduction exercises, found ${affectedMachineExercises}`)

const w30 = read('src/programs/black-crown/source-weeks/week-30.ts')
assert(w30.includes('Chest-Supported Row 2x10 RPE6 + Leg Extension 2x12 easy + Trap-3 2x12 + Dead Bug 2x8/side'), 'W30 non-max check changed')
assert(!/Machine Hip Abduction|Seated Band Hip Abduction/.test(w30), 'W30 received v2.1 glute amendment')

const audit = JSON.parse(read('BLACK_CROWN_RUNTIME_AUDIT.json'))
assert(audit.version === 'Black Crown Revised v2.1', 'runtime audit manifest version mismatch')
assert(audit.weeks === 54 && audit.sessions === 270, 'runtime audit totals changed')
assert(audit.strictOhpExposures === 42, 'runtime audit OHP count changed')
assert(audit.revision?.setNeutral === true, 'runtime audit missing set-neutral revision marker')

console.log('Black Crown v2.1 audit: PASS')
console.log('  W25–29 D5: redundant secondary row replaced by Machine Hip Abduction 2x15–25 @ RPE 7–8')
console.log('  Rest: 45–60 sec; equipment fallbacks governed separately')
console.log('  W30 and all weeks outside W25–29: unchanged by v2.1 amendment')
console.log('  54 weeks / 270 sessions / 42 Strict OHP exposures preserved')
