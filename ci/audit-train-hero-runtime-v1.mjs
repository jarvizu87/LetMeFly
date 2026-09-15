import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const root = path.resolve('.')
const manifestPath = path.join(root, 'overlays/ui-command-v2/static/train-heroes-v1/manifest.json')
const runtimePath = path.join(root, 'overlays/ui-command-v2/batch-av/train-hero-runtime-v1.js')
const installerPath = path.join(root, 'ci/install-train-hero-runtime-v1.sh')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const runtime = fs.readFileSync(runtimePath, 'utf8')
const installer = fs.readFileSync(installerPath, 'utf8')

const failStatePattern = /localStorage\.(setItem|removeItem)|sessionStorage\.(setItem|removeItem)|indexedDB|workoutSessions|programInstances|trainingMax|Math\.random/
assert.equal(failStatePattern.test(runtime), false, 'Hero selection must remain presentation-only and deterministic')
assert.equal(runtime.includes('/ui/train-lifter.webp'), false, 'Runtime must never own the retired single lifter image')
assert.equal(manifest.heroes.length, 9, 'Locked hero pack must contain exactly nine heroes')

const sandbox = {window:{}, console, Object, Array, String, RegExp, Set, Map, Math, Date, JSON}
vm.runInNewContext(runtime, sandbox, {filename:'train-hero-runtime-v1.js'})
const api = sandbox.window.__LMF_TRAIN_HERO_V1__
assert.ok(api, 'Runtime exposes the read-only hero selector contract')
assert.equal(api.packId, 'train-heroes-v1')
assert.equal(api.fallbackKey, 'accessory-recovery-work-capacity')
assert.deepEqual([...Object.keys(api.heroes)], manifest.heroes.map(hero => hero.key), 'Runtime keys match locked manifest order')

for (const hero of manifest.heroes) {
  assert.equal(api.heroes[hero.key], `/ui/train-heroes-v1/${hero.deliveryFile}`, `${hero.key} uses its locked delivery filename`)
  assert.ok(installer.includes(hero.deliveryFile), `${hero.deliveryFile} is materialized by the installer`)
}

const cases = [
  ['realization-testing-crown-day', {titles:['Black Crown Testing — Crown Day'], exercises:['Back Squat']}],
  ['yoke-trap-strength', {titles:['Yoke / Trap Strength'], exercises:['Heavy Yoke Carry','Shrugs']}],
  ['olympic-explosive', {titles:['Olympic / Explosive'], exercises:['Power Clean','High Pull']}],
  ['overhead-vertical-strength', {titles:['Overhead / Vertical Strength'], exercises:['Strict Press']}],
  ['deadlift-posterior-chain', {titles:['Deadlift / Posterior Chain'], exercises:['Deadlift','RDL']}],
  ['squat-lower-strength', {titles:['Squat / Lower Strength'], exercises:['Front Squat','Leg Press']}],
  ['conditioning-carries', {titles:['Conditioning / Carries'], exercises:['Sled Drag','Farmer Carry']}],
  ['bench-upper-push', {titles:['Bench / Upper Push'], exercises:['Bench Press','Chest Press']}],
  ['accessory-recovery-work-capacity', {titles:['Accessory / Recovery'], exercises:['Mobility Flow','Kettlebell Halo']}],
]
for (const [expected, descriptor] of cases) {
  assert.equal(api.selectKey(descriptor), expected, `Synthetic descriptor selects ${expected}`)
}

assert.equal(api.selectKey({titles:['Lower Strength — Squat Day'], exercises:['Hang Power Clean','Front Squat','Sled Drag']}), 'squat-lower-strength', 'Dominant day identity beats one-off exercise keywords')
assert.equal(api.selectKey({titles:['Deadlift Strength Day'], exercises:['Shrugs','Mobility Flow','RDL']}), 'deadlift-posterior-chain', 'Deadlift title remains dominant over accessory trap work')
assert.equal(api.selectKey({titles:['Squat Peak Testing'], exercises:['Back Squat']}), 'realization-testing-crown-day', 'Formal test semantics override ordinary movement emphasis')

const distArg = process.argv[2]
if (distArg) {
  const dist = path.resolve(distArg)
  const out = path.join(dist, 'ui/train-heroes-v1')
  const delivered = fs.readdirSync(out).filter(name => /^train-hero-v1-.*\.webp$/.test(name)).sort()
  assert.equal(delivered.length, 9, 'Production assembly contains all nine hero images')
  for (const hero of manifest.heroes) {
    const file = path.join(out, hero.deliveryFile)
    assert.ok(fs.statSync(file).size > 10000, `${hero.deliveryFile} is a non-empty delivered asset`)
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.subarray(0,4).toString('ascii'), 'RIFF', `${hero.deliveryFile} starts as RIFF`)
    assert.equal(bytes.subarray(8,12).toString('ascii'), 'WEBP', `${hero.deliveryFile} is WEBP`)
  }
  const builtRuntime = fs.readFileSync(path.join(dist, 'ui/train-hero-runtime-v1.js'), 'utf8')
  const reference = fs.readFileSync(path.join(dist, 'ui/home-train-reference-v1.js'), 'utf8')
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  const sw = fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8')
  assert.equal(builtRuntime, runtime, 'Production runtime matches audited source')
  assert.equal(reference.includes('src="/ui/train-lifter.webp"'), false, 'Production reference layer no longer hard-codes the squat/lifter hero')
  assert.ok(index.includes('/ui/train-hero-runtime-v1.js?v=1'), 'Production index loads hero runtime')
  assert.ok(sw.includes('-train-hero-v1'), 'Service-worker cache generation includes Train hero V1')
  for (const hero of manifest.heroes) assert.ok(sw.includes(`/ui/train-heroes-v1/${hero.deliveryFile}`), `${hero.deliveryFile} is available offline`)
}

console.log('TRAIN_HERO_RUNTIME_V1_PASS')
console.log(`pack=${api.packId} heroes=${Object.keys(api.heroes).length} deterministic=true presentationOnly=true`)
