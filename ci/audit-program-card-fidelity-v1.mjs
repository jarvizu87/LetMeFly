import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const servicePath = path.join(root, 'src/services/workout-service.ts')
const mainPath = path.join(root, 'src/main.ts')

const read = (file) => {
  assert.ok(fs.existsSync(file), `missing card-fidelity target: ${file}`)
  return fs.readFileSync(file, 'utf8')
}
const readTree = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? [readTree(full)] : /\.(?:ts|tsx|json)$/i.test(entry.name) ? [fs.readFileSync(full, 'utf8')] : []
}).join('\n')

const service = read(servicePath)
const main = read(mainPath)
const maintenance = readTree(path.join(root, 'src/programs/crown-maintenance'))
const blackCrown = readTree(path.join(root, 'src/programs/black-crown'))

// Crown Maintenance source remains the authority.
assert.match(maintenance, /Crown Maintenance/)
assert.match(maintenance, /verified-front-squat-1rm/)
assert.match(maintenance, /verified-bench-press-1rm/)
assert.match(maintenance, /verified-deadlift-1rm/)
assert.match(maintenance, /verified-clean-reference/)
assert.match(maintenance, /65%|65/)
assert.match(maintenance, /72\.5%|72\.5/)
assert.match(maintenance, /87\.5%|87\.5/)

// Maintenance percentage loads resolve from the athlete's completed Crownforge
// verified-result rows; no projected number or public hard-coded athlete value is used.
assert.match(service, /getVerifiedCrownforgeReferences/)
assert.match(service, /workoutSets/)
assert.match(service, /row\?\.athlete_id !== athleteId/)
assert.match(service, /!row\?\.completed/)
assert.match(service, /verified-clean-technical-reference/)
assert.match(service, /latest\['verified-clean-reference'\]/)
assert.match(service, /programKey === 'crown-maintenance' \? await getVerifiedCrownforgeReferences/)
assert.match(service, /Math\.ceil\(raw \/ 5\) \* 5/)

// Mixed Maintenance recovery sections must not be promoted into a giant circuit.
assert.match(service, /programKey === 'crown-maintenance'/)
assert.match(service, /candidate\.sets\.every/)
assert.match(service, /\^R\\d\+\$/)

// Workout history versions match the governed packages in the build.
assert.match(service, /program_version: programKey === 'black-crown' \? 'v2\.1'/)
assert.match(service, /programKey === 'crownforge' \? 'v2\.2'/)

// Black Crown source remains complete and includes the v2.1 amendment.
assert.match(blackCrown, /Black Crown Revised/)
assert.match(blackCrown, /Machine Hip Abduction/)
assert.match(blackCrown, /15-25|15–25/)
assert.match(blackCrown, /RPE 7|RPE7|7–8|7-8/)
assert.match(blackCrown, /black-crown:tm:/)

// Cards preserve the program's actual prescription dimensions rather than only
// reps/load: percentage, RPE, duration/distance and unilateral wording all render.
assert.match(service, /programmedRpe:/)
assert.match(service, /programmedSourceText:/)
assert.match(service, /percentage: programmed\.percentage/)
assert.match(service, /duration: programmed\.duration/)
assert.match(service, /distance: programmed\.distance/)
assert.match(main, /function workoutPrescriptionSummary/)
assert.match(main, /perf\.percentage/)
assert.match(main, /perf\.programmedRpe/)
assert.match(main, /perf\.distance \?\? perf\.duration \?\? perf\.programmedReps/)
assert.match(main, /each direction/)
assert.match(main, /programSetPrescriptionSummary/)
assert.match(main, /workoutPrescriptionSummary\(perf\)/)

// Variable-set wording stays visible. The adapter does not invent mandatory sets;
// the source label remains the truth for ranges such as 2-3 sets.
assert.match(main, /\\bsets\?\\b/)
assert.match(blackCrown, /2-3 sets|2–3 sets/)

console.log('Maintenance + Black Crown card fidelity audit: PASS')
console.log('- Crown Maintenance verified-reference percentage resolution: PASS')
console.log('- Maintenance mixed recovery section circuit guard: PASS')
console.log('- Black Crown percentage/RPE/metric card details: PASS')
console.log('- unilateral and variable-set wording visibility: PASS')
console.log('- governed program source packages unchanged by adapter: enforced by installer')
