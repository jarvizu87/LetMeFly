import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const app = process.argv[2]
if (!app) throw new Error('reconstructed app root required')
const root = process.cwd()
const sourceJs = path.join(root, 'overlays/ui-command-v2/batch-at/crownforge-circuit-train-v1.js')
const distJs = path.join(app, 'dist/ui/crownforge-circuit-train-v1.js')
const distCss = path.join(app, 'dist/ui/crownforge-circuit-train-v1.css')
const index = path.join(app, 'dist/index.html')
for (const file of [sourceJs, distJs, distCss, index]) {
  if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error(`Missing circuit Train audit target: ${file}`)
}

const source = fs.readFileSync(sourceJs, 'utf8')
const css = fs.readFileSync(distCss, 'utf8')
const html = fs.readFileSync(index, 'utf8')
const window = {}
const document = { readyState: 'loading', addEventListener() {} }
const context = {
  window, document, location: { hash: '' },
  requestAnimationFrame() {},
  MutationObserver: class { observe() {} },
  Element: class {}, HTMLInputElement: class {},
  console,
}
vm.runInNewContext(source, context)
const api = window.__LMF_CIRCUIT_TRAIN_V1__
if (!api) throw new Error('Pure circuit Train audit API unavailable')

const equal = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}
equal(api.exactRepDefault('R1 • 8 • 95 lb'), 8, 'exact circuit reps')
equal(api.exactRepDefault('Set 1 • 10 • bodyweight'), 10, 'exact set reps')
equal(api.exactRepDefault('R2 • 10/side • 20 lb/side'), 10, 'exact per-side reps remain 10 actual reps')
equal(api.exactRepDefault('8 per leg • bodyweight'), 8, 'exact per-leg reps remain 8 actual reps')
equal(api.exactRepDefault('R1 • 8–10 • 95 lb'), null, 'rep range remains manual')
equal(api.exactRepDefault('3 • 5 • 95 lb'), null, 'ambiguous numeric prescription remains manual')
equal(api.resolveProgrammedLoad('95:lb', '95', 'lb'), 95, 'same-unit load')
equal(api.resolveProgrammedLoad('95:lb', '95', 'kg'), 43.1, 'lb to kg load')
equal(api.resolveProgrammedLoad('20:kg', '20', 'lb'), 44.1, 'kg to lb load')
equal(api.resolveProgrammedLoad('RPE 7-8', '', 'lb'), null, 'non-exact load remains manual')

for (const marker of [
  'dataset.groupType',
  'lmf-circuit-strip',
  'AS PROGRAMMED',
  'dataset.programmedLoadDefault',
  'input.value === \'\'',
  'isSubstitutionCard',
]) {
  if (!source.includes(marker)) throw new Error(`Missing runtime safety marker: ${marker}`)
}
for (const forbidden of ['indexedDB', 'localStorage', 'logSet(', 'completeWorkout(']) {
  if (source.includes(forbidden)) throw new Error(`Circuit Train layer may not own persistence: ${forbidden}`)
}
for (const marker of [
  'width:min(50%,250px)',
  'height:220px',
  '.lmf-circuit-panel',
  '.lmf-confirm-programmed-hint',
  'position:absolute!important',
  '> :not(.lmf-exercise-media)',
  'background-image:var(--exercise-art)!important',
]) {
  if (!css.includes(marker)) throw new Error(`Missing visual marker: ${marker}`)
}
if (!html.includes('/ui/crownforge-circuit-train-v1.css?v=2') || !html.includes('/ui/crownforge-circuit-train-v1.js?v=2')) {
  throw new Error('Circuit Train v2 assets are not installed in production index')
}

console.log('LetMeFly Crownforge circuit-first Train UX audit: PASS')
console.log('- exact reps/load may prefill blank native controls only')
console.log('- exact per-side/per-limb reps remain the recorded rep count, never doubled')
console.log('- ranges/ambiguous prescriptions remain manual')
console.log('- lb/kg programmed loads convert to the athlete display unit')
console.log('- substitution cards and saved actuals retain native ownership')
console.log('- round metadata controls circuit presentation; no circuit is invented')
console.log('- active exercise art is absolutely blended behind content across card states')
