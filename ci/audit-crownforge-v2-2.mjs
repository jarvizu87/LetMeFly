import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const target = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const read = (rel) => {
  const full = path.join(target, rel)
  if (!fs.existsSync(full)) throw new Error(`missing ${rel}`)
  return fs.readFileSync(full, 'utf8')
}
const assert = (ok, message) => { if (!ok) throw new Error(message) }
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
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    h.update(path.relative(dir, file)); h.update('\0'); h.update(digest); h.update('\0')
  }
  return h.digest('hex')
}

const markerPath = path.join(target, '.crownforge-v2-2-book-informed.json')
assert(fs.existsSync(markerPath), 'Crownforge v2.2 marker missing')
const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
assert(marker.program === 'Crownforge', 'wrong program marker')
assert(marker.version === 'v2.2' && marker.baseVersion === 'v2.1', 'Crownforge v2.2 version lineage mismatch')
assert(marker.revisionId === 'day6-kb-swing-primer-conditional-v1', 'unexpected Crownforge v2.2 revision')
assert(JSON.stringify(marker.affectedWeeks) === JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12]), 'affected weeks changed')
assert(marker.affectedDay === 6, 'affected day changed')

const expectedChanged = [
  'src/programs/crownforge/metadata.ts',
  'src/programs/crownforge/weeks/week-01.ts',
  'src/programs/crownforge/weeks/week-02.ts',
  'src/programs/crownforge/weeks/weeks-03-06.ts',
].sort()
assert(JSON.stringify([...marker.changedFiles].sort()) === JSON.stringify(expectedChanged), 'Crownforge v2.2 changed-file scope is not exact')

const metadata = read('src/programs/crownforge/metadata.ts')
assert(metadata.includes("version: 'v2.2'"), 'Crownforge metadata is not v2.2')
assert(!metadata.includes("version: 'v2.1'"), 'Crownforge metadata still contains v2.1 version marker')

const note = 'Conditional technique primer only: perform 2 x 10 when hinge timing or stiffness needs a ramp; omit when Day 5 GPP was fully completed and the Day 6 hinge pattern is crisp. Never use as make-up GPP.'
for (const rel of ['src/programs/crownforge/weeks/week-01.ts','src/programs/crownforge/weeks/week-02.ts','src/programs/crownforge/weeks/weeks-03-06.ts']) {
  const text = read(rel)
  assert(text.includes("ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'conditional'"), `${rel} primer is not conditional`)
  assert(!text.includes("ex('kb-swing-primer-d6', 'KB Swing', 'kettlebell', 'mandatory'"), `${rel} still has mandatory primer`)
  assert(text.includes(note), `${rel} missing v2.2 governance note`)
  assert(text.includes("ex('kb-swing-d6', 'KB Swing', 'kettlebell', 'conditional'"), `${rel} main Day-6 KB Swing changed/disappeared`)
  assert(text.includes("ex('kb-swing-d5', 'KB Swing', 'kettlebell', 'conditional'"), `${rel} Day-5 KB/GPP Swing changed/disappeared`)
}

for (let week = 7; week <= 12; week += 1) {
  const text = read(`src/programs/crownforge/weeks/week-${String(week).padStart(2,'0')}.ts`)
  assert(text.includes('makeD6({'), `Week ${week} no longer uses governed Day-6 builder`)
}
const builder = read('src/programs/crownforge/weeks/weeks-03-06.ts')
assert(builder.includes("config.deload ? '12 kg (25 lb) KB' : (config.primerKb ?? config.kb)"), 'primer load/deload logic changed')
assert(builder.includes("repeated(config.deload ? 2 : 4, config.deload ? 10 : '15–20', config.kb"), 'main Day-6 Swing build/deload logic changed')

// Weeks 13–14 live in the governed testing/handoff module rather than the weekly builder files.
const testing = read('src/programs/crownforge/testing/weeks-13-14.ts')
assert(!testing.includes('Conditional technique primer only'), 'Weeks 13–14 testing/handoff received out-of-scope v2.2 primer note')

const bcHash = treeHash(path.join(target, 'src/programs/black-crown'))
const maintenanceHash = treeHash(path.join(target, 'src/programs/crown-maintenance'))
assert(marker.protectedAfter.blackCrown === bcHash, 'Black Crown changed after Crownforge v2.2 application')
assert(marker.protectedAfter.crownMaintenance === maintenanceHash, 'Crown Maintenance changed after Crownforge v2.2 application')
const bcMeta = read('src/programs/black-crown/metadata.ts')
assert(bcMeta.includes("version: 'v2.1'"), 'Black Crown protected baseline is not v2.1')

assert(marker.decision?.modify?.length === 1, 'final book audit should have one Crownforge modification')
assert(marker.decision.modify[0] === 'Day 6 light KB Swing primer priority only', 'unexpected final Crownforge modification')
assert(marker.decision.keep?.includes('main kettlebell progression'), 'main kettlebell progression was not explicitly kept')
assert(marker.decision.reject?.includes('adding more Olympic volume'), 'Olympic volume-add rejection missing')
assert(marker.decision.reject?.includes('adding more kettlebell volume'), 'kettlebell volume-add rejection missing')
assert(marker.decision.reject?.includes('adding more sled volume'), 'sled volume-add rejection missing')

console.log('Crownforge v2.2 final book-informed production audit: PASS')
console.log('  MODIFY: W1-W12 Day-6 light KB Swing primer mandatory -> conditional, same 2x10/load when used')
console.log('  KEEP: main strength, Olympic, KB, sled/GPP, deload, testing/handoff structure')
console.log('  REJECT: added volume/complexity without a diagnosed need')
console.log('  Protected: Black Crown Revised v2.1 + Crown Maintenance unchanged')
