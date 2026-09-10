#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const root = path.resolve(process.cwd())
const sourceMain = path.join(target, 'src/main.ts')
const sourceService = path.join(target, 'src/services/workout-service.ts')
const runtime = path.join(root, 'overlays/exercise-intelligence/runtime/exercise-intelligence-substitutions-v1.js')
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
const ui = read(runtime)
const styles = read(css)

check(service.includes('prescribedExerciseKey: exercise.id') && service.includes('prescribedExerciseName: exercise.name'), 'Workout creation snapshots prescribed exercise identity')
check(service.includes('export async function substituteWorkoutExercise('), 'Workout service exposes active-session substitution mutation')
check(service.includes('export async function revertWorkoutExerciseSubstitution('), 'Workout service exposes substitution revert mutation')
check(service.includes("session.status !== 'in_progress'"), 'Completed workout history is protected from substitution relabeling')
check(service.includes('Reopen completed sets before changing this exercise so history stays accurate'), 'Mixed original/substitute sets cannot be mislabeled')
check(service.includes('substituted_from_exercise_key: prescribedKey'), 'Performed exercise retains prescribed exercise provenance')
check(service.includes('substitutionOriginalLoadValue') && service.includes('substitutionOriginalLoadUnit'), 'Original set load is retained for exact revert')
check(service.includes("loadMode === 'factor'") && service.includes("loadMode === 'manual'") && service.includes("loadMode === 'none'"), 'Substitute loading supports deterministic, explicit, and unloaded modes')
check(service.includes('delete perf.substitutionPerformedExerciseKey') && service.includes('load_value: baseline.value'), 'Undo restores programmed load baseline and removes transient substitute set metadata')

check(main.includes('LetMeFlyWorkoutSubstitutionBridge'), 'Workout Mode exposes a narrow substitution bridge')
check(main.includes('getSubstitutions?.(prescribedKey, { includeBlocked: true })'), 'Bridge revalidates the governed rule instead of trusting button payload')
check(main.includes("promotion.startsWith('DO NOT')"), 'DO NOT DEFAULT relationships are rejected by the mutation bridge')
check(main.includes('TODAY\'S SUBSTITUTE') && main.includes('Programmed: ${esc(prescribedName)}'), 'Workout card distinguishes performed substitute from programmed exercise')
check(main.includes('data-workout-exercise-id=') && main.includes('UNDO SUBSTITUTE'), 'Workout card exposes apply context and revert control')
check(main.includes('getApprovedSubstitutions(prescribedName'), 'Changing a substitute continues to use the original programmed movement rules')
check(main.includes("showToast(`Using ${alternativeName} for this workout only`)"), 'UI explicitly labels substitution as workout-only')

check(ui.includes('USE THIS SUBSTITUTE FOR TODAY'), 'Governed viewer exposes workout-only apply action')
check(ui.includes('WORKOUT INSTANCE ONLY') && ui.includes('VIEW ONLY'), 'Viewer stays actionable in Workout Mode and informational elsewhere')
check(ui.includes("!String(rule.promotionStatus || '').startsWith('DO NOT')"), 'Blocked relationships never receive an apply action')
check(ui.includes('LetMeFlyWorkoutSubstitutionBridge'), 'Viewer delegates mutation to the authenticated workout bridge')
check(!ui.includes('indexedDB') && !ui.includes('localStorage') && !ui.includes('sessionStorage'), 'Public substitution viewer has no direct private-storage write path')
check(ui.includes('data-lmf-sub-manual-load') && ui.includes('LOAD PREFILL'), 'Non-equivalent load handling is explicit rather than blind pound copying')
check(styles.includes('.lmf-substitution-active') && styles.includes('.lmf-sub-use'), 'Substitution and apply states have dedicated UI styling')

// The feature patch is restricted to active workout persistence. Program source
// remains governed by the existing program engine and full-cycle audits.
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
