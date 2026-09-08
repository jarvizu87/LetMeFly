import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const mustRead = (rel) => {
  const full = path.join(target, rel)
  if (!fs.existsSync(full)) throw new Error(`missing ${rel}`)
  return fs.readFileSync(full, 'utf8')
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message)
}
const treeHash = (dir) => {
  const files = []
  const walk = (base) => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const full = path.join(base, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  walk(dir)
  files.sort()
  const h = crypto.createHash('sha256')
  for (const file of files) {
    const fileDigest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    h.update(path.relative(dir, file))
    h.update('\0')
    h.update(fileDigest)
    h.update('\0')
  }
  return h.digest('hex')
}

const markerPath = path.join(target, '.book-informed-program-delta-candidate.json')
assert(fs.existsSync(markerPath), 'candidate marker missing')
const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
assert(marker.candidate === 'crownforge-day6-kb-primer-conditional-v1', 'unexpected candidate marker')
assert(marker.baseProgram === 'Crownforge v2.1', 'candidate base program changed')
assert(marker.blackCrownBookCandidate?.startsWith('REJECTED'), 'Black Crown book candidate must remain rejected')

const expectedChanged = [
  'src/programs/crownforge/weeks/week-01.ts',
  'src/programs/crownforge/weeks/week-02.ts',
  'src/programs/crownforge/weeks/weeks-03-06.ts',
].sort()
assert(JSON.stringify([...marker.changedFiles].sort()) === JSON.stringify(expectedChanged), 'candidate changed-file scope is not exact')
assert(JSON.stringify([...marker.crownforgeChangedFilesVerified].sort()) === JSON.stringify(expectedChanged), 'Crownforge file-hash scope guard failed')

const conditionalPhrase = 'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'
const week1 = mustRead('src/programs/crownforge/weeks/week-01.ts')
const week2 = mustRead('src/programs/crownforge/weeks/week-02.ts')
const builder = mustRead('src/programs/crownforge/weeks/weeks-03-06.ts')
for (const [name, text] of [['week-01', week1], ['week-02', week2], ['weeks-03-06 builder', builder]]) {
  assert(text.includes("ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional'"), `${name} primer is not conditional`)
  assert(!text.includes("ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory'"), `${name} still contains mandatory Day-6 swing primer`)
  assert(text.includes(conditionalPhrase), `${name} missing governed candidate note`)
  assert(text.includes("ex('kb-swing-d6', 'KB Swing', 'kettlebell', 'conditional'"), `${name} main Day-6 swing dose changed or disappeared`)
  assert(text.includes("ex('kb-swing-d5', 'KB Swing', 'kettlebell', 'conditional'"), `${name} Day-5 KB/GPP swing changed or disappeared`)
}

for (let week = 7; week <= 12; week += 1) {
  const text = mustRead(`src/programs/crownforge/weeks/week-${String(week).padStart(2, '0')}.ts`)
  assert(text.includes('makeD6({'), `Crownforge Week ${week} no longer consumes governed makeD6 builder`)
}

// Deload weeks must still use the existing 12 kg primer/main swing configuration.
assert(builder.includes("config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)"), 'Crownforge deload primer load logic changed')
assert(builder.includes("repeated(config.deload ? 2 : 4, config.deload ? 10 : '15–20', config.kb"), 'Crownforge main Day-6 swing deload/build logic changed')

// The candidate must not mutate protected programs. This matches the apply script's
// digest-of-digests tree algorithm so the independent post-apply check is comparable.
const blackCrownHash = treeHash(path.join(target, 'src/programs/black-crown'))
const maintenanceHash = treeHash(path.join(target, 'src/programs/crown-maintenance'))
assert(marker.protectedAfter.blackCrown === blackCrownHash, 'Black Crown tree changed after candidate application')
assert(marker.protectedAfter.crownMaintenance === maintenanceHash, 'Crown Maintenance tree changed after candidate application')

// Explicitly prove the rejected Black Crown idea was NOT applied.
for (let week = 25; week <= 29; week += 1) {
  const text = mustRead(`src/programs/black-crown/source-weeks/week-${String(week).padStart(2, '0')}.ts`)
  assert(text.includes('No additional loaded glute slot; weekly roles already supplied by D1 hip thrust/lunge + D3 deadlift'), `Black Crown W${week} lost source-local no-extra-glute rule`)
  assert(text.includes('Lat Pulldown 2–3x8–10 + Chest-Supported Row 2x8–10'), `Black Crown W${week} structural row was changed`)
  assert(!/Machine Hip Abduction|Seated Band Hip Abduction/.test(text), `Black Crown W${week} received rejected abduction candidate`)
}
const week30 = mustRead('src/programs/black-crown/source-weeks/week-30.ts')
assert(week30.includes('Chest-Supported Row 2x10 RPE6 + Leg Extension 2x12 easy + Trap-3 2x12 + Dead Bug 2x8/side'), 'Black Crown W30 non-max check changed')

console.log('Book-informed program delta candidate audit: PASS')
console.log('  Crownforge: W1-W12 Day-6 KB primer is conditional only; main KB/Day-5 work preserved')
console.log('  Black Crown: v2.0 source remains unchanged; B5 abduction idea remains rejected')
console.log('  Crown Maintenance: unchanged')
