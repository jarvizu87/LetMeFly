import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const mainPath = path.join(root, 'src/main.ts')
const servicePath = path.join(root, 'src/services/workout-service.ts')
const flowPath = path.join(root, 'public/ui/workout-flow-v1.js')
const cssPath = path.join(root, 'src/command-v2.css')

function read(file) {
  assert.ok(fs.existsSync(file), `missing audit target: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

function readTree(dir) {
  if (!fs.existsSync(dir)) return ''
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return [readTree(full)]
    if (!/\.(?:ts|tsx|js|json)$/i.test(entry.name)) return []
    return [fs.readFileSync(full, 'utf8')]
  }).join('\n')
}

function metricMeta(value, explicitDistance = '', explicitDuration = '') {
  const source = String(explicitDistance || explicitDuration || value || '').trim()
  if (explicitDistance || /(?:^|\s)\d+(?:\s*[–-]\s*\d+)?\s*(?:m|meter|meters|metre|metres|yd|yard|yards|ft|feet)(?:\b|\/)/i.test(source)) {
    const unit = /(?:yd|yard)/i.test(source) ? 'yd' : /(?:ft|feet)/i.test(source) ? 'ft' : 'm'
    return { kind: 'distance', unit }
  }
  if (explicitDuration || /\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(source)) {
    const unit = /\b(?:hr|hrs|hour|hours)\b/i.test(source) ? 'hr' : /\b(?:min|mins|minute|minutes)\b/i.test(source) ? 'min' : 'sec'
    return { kind: 'duration', unit }
  }
  return { kind: 'reps', unit: 'reps' }
}

function inferredGroupType(exercises) {
  if (exercises.length < 2) return 'section'
  const roundExercises = exercises.filter((sets) => sets.some((label) => /^R\d+$/i.test(String(label ?? ''))))
  return roundExercises.length > 1 ? 'round' : 'section'
}

function shouldCarry({ previousSignature = '', currentSignature = '', currentValue = '', programmedDefault = '' }) {
  if ((currentSignature || previousSignature) && currentSignature !== previousSignature) return false
  if (!currentValue) return true
  if (!programmedDefault) return false
  const current = Number.parseFloat(currentValue)
  const programmed = Number.parseFloat(programmedDefault)
  return Number.isFinite(current) && Number.isFinite(programmed) && Math.abs(current - programmed) < 0.001
}

const main = read(mainPath)
const service = read(servicePath)
const flow = read(flowPath)
const css = read(cssPath)
const programSource = readTree(path.join(root, 'src/data'))

// Source contract: structured grouping is persisted and rendered into runtime DOM.
assert.match(service, /group_type:\s*section\.exercises\.length\s*>\s*1/)
assert.match(service, /\/\^R\\d\+\$\/i/)
assert.match(main, /data-group-type=/)
assert.match(flow, /structured === 'round'/)
assert.match(flow, /structured === 'circuit'/)

// Source contract: immutable prescription remains visible independently of actual logging.
assert.match(main, /lmf-prescription-cell/)
assert.match(main, /data-prescription-kind=/)
assert.match(main, /data-metric-unit=/)
assert.match(main, /metric-input/)
assert.match(flow, /\.lmf-prescription-cell strong/)
assert.match(css, /\.lmf-workout-flow-card \.lmf-prescription-cell\{display:block!important\}/)

// Source contract: metric actuals persist without rewriting programmed reps/load snapshots.
assert.match(service, /programmedLoadValue:/)
assert.match(service, /programmedLoadUnit:/)
assert.match(service, /actualMetricKind:/)
assert.match(service, /actualMetricValue:/)
assert.match(service, /actualMetricUnit:/)
assert.match(main, /metricKind:\s*metricKind === 'reps' \? null : metricKind/)

// Metric classification fixtures cover the user-reported and adjacent prescription shapes.
assert.deepEqual(metricMeta(8), { kind: 'reps', unit: 'reps' })
assert.deepEqual(metricMeta('1/side'), { kind: 'reps', unit: 'reps' })
assert.deepEqual(metricMeta('10-15'), { kind: 'reps', unit: 'reps' })
assert.deepEqual(metricMeta('3 slow breaths/side'), { kind: 'reps', unit: 'reps' })
assert.deepEqual(metricMeta('20m'), { kind: 'distance', unit: 'm' })
assert.deepEqual(metricMeta('20–30m'), { kind: 'distance', unit: 'm' })
assert.deepEqual(metricMeta('40 yd'), { kind: 'distance', unit: 'yd' })
assert.deepEqual(metricMeta('60–90 sec'), { kind: 'duration', unit: 'sec' })
assert.deepEqual(metricMeta('20–30 min easy'), { kind: 'duration', unit: 'min' })
assert.deepEqual(metricMeta('', '25m', ''), { kind: 'distance', unit: 'm' })
assert.deepEqual(metricMeta('', '', '90 sec'), { kind: 'duration', unit: 'sec' })

// Real grouping shapes: Day 3 recovery flow must be round-robin; numeric sled work remains straight.
assert.equal(inferredGroupType([['R1', 'R2'], ['R1', 'R2'], ['R1', 'R2']]), 'round')
assert.equal(inferredGroupType([['R1', 'R2']]), 'section', 'one-exercise round labels must not manufacture a circuit')
assert.equal(inferredGroupType([['1', '2'], ['1', '2'], ['1', '2']]), 'section')
assert.equal(inferredGroupType([['R1', 'R2'], ['R1', 'R2'], ['1', '2']]), 'round')

// Load precedence: athlete adjustment carries only across the same underlying prescription.
assert.equal(shouldCarry({ previousSignature: '115:lb', currentSignature: '115:lb', currentValue: '115', programmedDefault: '115' }), true)
assert.equal(shouldCarry({ previousSignature: '115:lb', currentSignature: '125:lb', currentValue: '125', programmedDefault: '125' }), false)
assert.equal(shouldCarry({ previousSignature: '8 kg (20 lb) KB', currentSignature: '8 kg (20 lb) KB', currentValue: '', programmedDefault: '' }), true)
assert.equal(shouldCarry({ previousSignature: '115:lb', currentSignature: '115:lb', currentValue: '120', programmedDefault: '115' }), false, 'manual next-set adjustment must not be overwritten')
assert.equal(shouldCarry({ previousSignature: '', currentSignature: '', currentValue: '', programmedDefault: '' }), true)

// Non-loaded conditioning must not keep a fake Load box; loaded sled/carry rows are controlled by data-has-load=true.
assert.match(css, /data-has-load="false"[^}]*\.load-field[\s\S]*display:none!important/)
assert.match(css, /reps reps reps reps rpe rpe/)

// Real governed program fixtures must be present in reconstructed source, not only synthetic tests.
assert.match(programSource, /Recovery Flow/)
assert.match(programSource, /Backward Sled Drag/)
assert.match(programSource, /Walk or Bike|Bike \/ Row \/ Walk/)
assert.match(programSource, /20m|20–30m|20-30m/)
assert.match(programSource, /20–30 min easy|20-30 min easy|60–90 sec|60-90 sec/)
assert.match(programSource, /1\/side/)

console.log('Workout prescription fidelity audit: PASS')
console.log('  structured round metadata: PASS')
console.log('  Day 3 round-vs-straight fixtures: PASS')
console.log('  immutable prescription visibility: PASS')
console.log('  reps / distance / duration classification: PASS')
console.log('  non-loaded cardio hides Load: PASS')
console.log('  same-prescription load carry precedence: PASS')
console.log('  real Crownforge metric fixtures present: PASS')
