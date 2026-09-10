#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const target = path.resolve(process.argv[2] || path.join(root, '.build-src/letmefly_app'))
const sourceMain = path.join(target, 'src/main.ts')
const sourceService = path.join(target, 'src/services/workout-service.ts')
const sourceAthlete = path.join(target, 'src/services/athlete-service.ts')
const runtime = path.join(root, 'overlays/exercise-intelligence/runtime/exercise-intelligence-substitutions-v1.js')
const intelligenceRuntime = path.join(root, 'overlays/exercise-intelligence/runtime/exercise-intelligence-runtime-v1.js')
const css = path.join(root, 'overlays/exercise-intelligence/runtime/exercise-intelligence-substitutions-v1.css')
const failures = []
const passes = []

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`)
  return fs.readFileSync(file, 'utf8')
}
function check(ok, label, detail = '') {
  if (ok) {
    passes.push({ label, detail })
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures.push({ label, detail })
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const main = read(sourceMain)
const service = read(sourceService)
const athlete = read(sourceAthlete)
const ui = read(runtime)
const intelligence = read(intelligenceRuntime)
const styles = read(css)

check(service.includes('prescribedExerciseKey: exercise.id') && service.includes('prescribedExerciseName: exercise.name'), 'Workout creation snapshots prescribed exercise identity')
check(service.includes('export async function substituteWorkoutExercise('), 'Workout service exposes active-session substitution mutation')
check(service.includes('export async function revertWorkoutExerciseSubstitution('), 'Workout service exposes substitution revert mutation')
check(service.includes("session.status !== 'in_progress'"), 'Completed workout history is protected from substitution relabeling')
check(service.includes('Completed substitute work is locked to the exercise actually performed'), 'Completed substitute sets cannot be reassigned to another movement')
check(service.includes('Completed substitute work cannot be relabeled'), 'Undo after logged substitute work fails closed')
check(service.includes('substituted_from_exercise_key: prescribedKey'), 'Performed exercise retains prescribed exercise provenance')
check(service.includes('substitutionOriginalLoadValue') && service.includes('substitutionOriginalLoadUnit'), 'Original set load is retained for exact pre-performance revert')
check(service.includes('substitutionReason: input.reason ?? null') && service.includes('substitutionReasonDetail: input.reasonDetail ?? null'), 'Substitution reason is stored with workout performance provenance')
check(service.includes('loadStrategy: input.loadStrategy ?? null'), 'Machine-readable load strategy is persisted with substitution provenance')
check(service.includes('delete perf.substitutionReason') && service.includes('load_value: baseline.value'), 'Clean undo restores programmed baseline and removes transient substitution metadata')

check(service.includes('export async function previousExercisePerformance('), 'Workout service exposes previous performed-exercise history')
check(service.includes("String(row.exercise_key) === exerciseKey"), 'Previous performance lookup keys from the exercise actually performed')
check(service.includes("row.status === 'completed'"), 'Previous substitute history only uses completed workouts')

check(athlete.includes('export async function updateSubstitutionEquipmentProfile('), 'Athlete service exposes governed equipment-profile enrichment')
check(athlete.includes('equipmentAccess') && athlete.includes('profile_context_v2'), 'Equipment availability is retained in private athlete context')
check(athlete.includes("putEntityWithOutbox(\n    'athletes'"), 'Persistent equipment answers follow the athlete sync outbox path')

for (const strategy of ['same-load', 'percentage-adjustment', 'rpe-guided', 'rep-guided', 'no-load-transfer']) {
  check(intelligence.includes(`'${strategy}'`), `Structured load strategy supported: ${strategy}`)
}
check(intelligence.includes("'VS-026'") && intelligence.includes("strategy: 'no-load-transfer'"), 'Machine-to-band Black Crown substitution explicitly blocks pound transfer')
check(intelligence.includes('DEFAULT_LOAD_TRANSFER') && intelligence.includes("strategy: 'rpe-guided'"), 'Unreviewed conversions fail safely to effort-guided loading')
check(!main.includes('function workoutSubstitutionLoadPlan(textValue'), 'Workout Mode no longer parses coaching prose to calculate load')
check(main.includes("strategy === 'percentage-adjustment'") && main.includes("strategy === 'same-load'"), 'Workout Mode consumes structured load strategy')

check(main.includes('LetMeFlyWorkoutSubstitutionBridge'), 'Workout Mode exposes a narrow substitution bridge')
check(main.includes('const governedPrimary = intelligence?.getExercise?.(prescribedKey) ?? intelligence?.getExercise?.(prescribedName)'), 'Bridge resolves program exercise keys through governed name/alias fallback')
check(main.includes('getSubstitutions?.(governedPrimaryKey, { includeBlocked: true })'), 'Bridge revalidates the governed rule instead of trusting button payload')
check(main.includes("promotion.startsWith('DO NOT')"), 'DO NOT DEFAULT relationships are rejected by the mutation bridge')
check(main.includes('workoutSubstitutionTemporaryEquipment') && main.includes('workoutSubstitutionEquipmentStatus'), 'Equipment availability is evaluated before substitution')
check(main.includes('Confirm equipment availability before applying this substitute'), 'Unknown equipment blocks apply until the athlete answers')
check(main.includes('updateSubstitutionEquipmentProfile') && main.includes('setEquipmentAvailability'), 'First-use equipment answer can enrich athlete profile')
check(main.includes('async previousPerformance(workoutExerciseId'), 'Substitution modal can request prior substitute performance')
check(main.includes('loadStrategy: preview.loadPlan.strategy') && main.includes('reason: input.reason ?? null'), 'Bridge persists load strategy and optional reason')
check(main.includes('getApprovedSubstitutions(prescribedName'), 'Changing a substitute continues to evaluate the original programmed movement')
check(main.includes('PERFORMING TODAY: ${esc(name)}') && main.includes('PROGRAM SLOT: ${esc(prescribedName)}'), 'Workout card distinguishes performed substitute from programmed slot')
check(main.includes('SUBSTITUTE LOCKED') && main.includes('Logged substitute work is locked'), 'Logged substitute performance is visibly immutable')
check(main.includes("showToast(`Using ${alternativeName} for this workout only`)"), 'UI explicitly labels substitution as workout-only')

check(ui.includes('USE THIS SUBSTITUTE FOR TODAY'), 'Governed viewer exposes workout-only apply action')
check(ui.includes('WORKOUT INSTANCE ONLY') && ui.includes('VIEW ONLY'), 'Viewer stays actionable in Workout Mode and informational elsewhere')
check(ui.includes("!String(rule.promotionStatus || '').startsWith('DO NOT')"), 'Blocked relationships never receive an apply action')
check(ui.includes('LetMeFlyWorkoutSubstitutionBridge'), 'Viewer delegates private mutation to Workout Mode bridge')
check(!ui.includes('indexedDB') && !ui.includes('localStorage') && !ui.includes('sessionStorage'), 'Public substitution viewer has no direct private-storage write path')
check(ui.includes('DO YOU HAVE THIS EQUIPMENT?') && ui.includes('YES • SAVE TO PROFILE') && ui.includes('NO • TODAY ONLY'), 'Unknown equipment has first-use/profile fallback choices')
check(ui.includes('WHY ARE YOU SUBSTITUTING?') && ui.includes('Discomfort / possible strain'), 'Optional substitution reason is available')
check(ui.includes('SAFETY CHECK') && ui.includes('data-lmf-sub-safety-ack'), 'Discomfort reason requires explicit safety acknowledgement')
check(ui.includes('LAST PERFORMANCE') && ui.includes('previousPerformance'), 'Substitution flow surfaces previous performance for the substitute')
check(ui.includes('data-lmf-sub-manual-load') && ui.includes('DO NOT TRANSFER'), 'Non-equivalent load handling is explicit rather than blind pound copying')
check(styles.includes('.lmf-substitution-active') && styles.includes('.lmf-sub-equipment') && styles.includes('.lmf-sub-history') && styles.includes('.lmf-sub-reason'), 'Substitution, equipment, history and reason states have dedicated UI styling')

check(!service.includes("from '../data/programs'") && !main.includes('programPrescriptionOwner ='), 'Workout substitution code does not take ownership of program definitions')

const report = {
  result: failures.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(),
  passes,
  failures,
}
fs.writeFileSync(path.join(target, 'WORKOUT_SUBSTITUTION_TODAY_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`)

if (failures.length) {
  console.error(`Issue #54 workout substitution audit: FAIL (${failures.length} failure(s))`)
  process.exit(1)
}
console.log(`Issue #54 workout substitution audit: PASS (${passes.length} checks)`)
