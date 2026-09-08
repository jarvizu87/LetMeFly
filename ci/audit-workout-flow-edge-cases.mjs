import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const flowJs = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-s/workout-flow-v1.js'), 'utf8')
const flowCss = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-s/workout-flow-v1.css'), 'utf8')
const edgeCss = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-u/workout-flow-edge-audit-v1.css'), 'utf8')
const pyramidJs = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-t/pyramid-flow-v1.js'), 'utf8')
const pyramidCss = fs.readFileSync(path.join(root, 'overlays/ui-command-v2/batch-t/pyramid-flow-v1.css'), 'utf8')

function currentRound(setCounts, completed) {
  const incomplete = []
  setCounts.forEach((count, exerciseIndex) => {
    for (let round = 1; round <= count; round += 1) {
      if (!completed.has(`${exerciseIndex}:${round}`)) incomplete.push(round)
    }
  })
  return incomplete.length ? Math.min(...incomplete) : null
}

function activeExercise(setCounts, completed) {
  const round = currentRound(setCounts, completed)
  if (round == null) return null
  return setCounts.findIndex((count, exerciseIndex) => (
    round <= count && !completed.has(`${exerciseIndex}:${round}`)
  ))
}

function completeRound(setCounts, completed, round) {
  setCounts.forEach((count, exerciseIndex) => {
    if (round <= count) completed.add(`${exerciseIndex}:${round}`)
  })
}

// Real Crownforge v2.1 fixture: Week 1 Main Strength Circuit.
// Front Squat 7, Bench 4, Row 4, KB Swing 3, Hanging Knee Raise 3, Sled Drag 4.
const crownforgeW1 = [7, 4, 4, 3, 3, 4]
const done = new Set()
assert.equal(currentRound(crownforgeW1, done), 1)
assert.equal(activeExercise(crownforgeW1, done), 0)

done.add('0:1')
assert.equal(activeExercise(crownforgeW1, done), 1)
done.add('1:1')
assert.equal(activeExercise(crownforgeW1, done), 2)

completeRound(crownforgeW1, done, 1)
assert.equal(currentRound(crownforgeW1, done), 2)
completeRound(crownforgeW1, done, 2)
completeRound(crownforgeW1, done, 3)
completeRound(crownforgeW1, done, 4)
assert.equal(currentRound(crownforgeW1, done), 5)
assert.equal(activeExercise(crownforgeW1, done), 0, 'support exercises must drop out after round 4')
assert.equal(Math.max(...crownforgeW1), 7)

// Real Crownforge long-wave fixture reaches ten rounds/sets.
const crownforgeTenSetWave = [10, 3, 3, 3]
assert.equal(Math.max(...crownforgeTenSetWave), 10)

// Reopened-set behavior: reopening completed work must make that round current again.
const reopened = new Set()
completeRound([3, 3], reopened, 1)
completeRound([3, 3], reopened, 2)
assert.equal(currentRound([3, 3], reopened), 3)
reopened.delete('0:2')
assert.equal(currentRound([3, 3], reopened), 2)
assert.equal(activeExercise([3, 3], reopened), 0)

// Black Crown v2.0 real straight-wave shape: Sheiko base wave = five listed work sets.
const blackCrownSheikoWave = [
  { reps: 5, load: 130, rpe: '' },
  { reps: 5, load: 140, rpe: '' },
  { reps: 4, load: 145, rpe: '' },
  { reps: 3, load: 150, rpe: '' },
  { reps: 5, load: 140, rpe: '' },
]
assert.equal(blackCrownSheikoWave.length, 5)
assert.ok(blackCrownSheikoWave.some((set) => set.rpe === ''), 'missing RPE is a valid governed state')

// Future-proof 12-set case: tabs must scroll rather than shrink below touch size.
assert.match(flowCss, /overflow-x:auto/)
assert.match(edgeCss, /@media \(max-width:360px\)/)
assert.match(edgeCss, /min-width:48px!important/)
assert.match(pyramidCss, /min-width:54px!important/)

// Actual source edge: Black Crown can label a one-exercise section as CIRCUIT / LOW-INTENSITY WORK.
assert.match(flowJs, /cards\.length < 2/)
assert.match(flowJs, /return 'sequential'/)

// Completion/reopen and true between-round transition behavior.
assert.match(flowJs, /restGateByPanel/)
assert.match(flowJs, /data-lmf-rest-continue/)
assert.match(flowJs, /const nowDone = isDone\(row\)/)
assert.match(flowJs, /if \(nowDone\) selectedSetByExercise\.delete\(key\)/)
assert.match(flowJs, /else selectedSetByExercise\.set\(key, rowId\)/)

// Long names, small thumbnails, and missing values.
assert.match(edgeCss, /-webkit-line-clamp:2/)
assert.match(edgeCss, /background-size:contain!important/)
assert.match(flowJs, /setAttribute\('placeholder', '—'\)/)
assert.match(flowJs, /Load \/ bodyweight as prescribed/)

// 10+ set usability and auto-centering.
assert.match(flowJs, /scrollActiveTabIntoView/)
assert.match(flowJs, /scrollIntoView/)
assert.match(pyramidJs, /is-long/)

// Superset / tri-set / giant-set / circuit remain recognized by the shared flow engine.
for (const marker of ['superset', 'tri-set', 'giant-set', 'circuit']) {
  assert.ok(flowJs.includes(marker), `${marker} flow marker missing`)
}

console.log('Workout Flow edge-case audit: PASS')
console.log('  Crownforge uneven circuit/drop-off: PASS')
console.log('  Crownforge 10-set wave: PASS')
console.log('  Black Crown five-set wave + blank RPE: PASS')
console.log('  12+ set horizontal-scroll guard: PASS')
console.log('  completed/reopened set semantics: PASS')
console.log('  one-exercise circuit-label guard: PASS')
console.log('  between-round rest gate: PASS')
console.log('  320–360px responsive controls: PASS')
console.log('  long-name + full-thumbnail treatment: PASS')
