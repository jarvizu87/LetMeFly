import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

const facade = read('src/data/programs.ts')
const registry = read('src/programs/registry.ts')
const engineTypes = read('src/program-engine/types.ts')
const crownforge = read('src/programs/crownforge/index.ts')
const maintenance = read('src/programs/crown-maintenance/index.ts')
const blackCrown = read('src/programs/black-crown/index.ts')
const blackCrownMetadata = read('src/programs/black-crown/metadata.ts')

check(!/CROWNFORGE_WEEK_1\s*:\s*ProgramWeek\s*=/.test(facade), 'Compatibility facade contains Crownforge workout prescriptions')
check(!/date:\s*'2026-/.test(facade), 'Compatibility facade contains dated workout prescriptions')
check(facade.includes("export * from '../programs/registry'"), 'Compatibility facade does not delegate to program registry')
check(facade.includes("export * from '../program-engine/types'"), 'Compatibility facade does not delegate shared program types')

check(registry.includes("from './crownforge'"), 'Registry is missing Crownforge package')
check(registry.includes("from './crown-maintenance'"), 'Registry is missing Crown Maintenance package')
check(registry.includes("from './black-crown'"), 'Registry is missing Black Crown package')
check(!/week:\s*1,\s*\n\s*start:/.test(registry), 'Registry contains workout prescriptions instead of package references')

check(crownforge.includes('CROWNFORGE_WEEK_14'), 'Crownforge package does not assemble all 14 weeks')
check(maintenance.includes('CROWN_MAINTENANCE_WEEKS'), 'Crown Maintenance package does not assemble its bridge weeks')
check(blackCrown.includes('weekData: BLACK_CROWN_WEEKS'), 'Black Crown package must expose governed runtime week data')
check(blackCrownMetadata.includes("status: 'active-source'"), 'Black Crown metadata must be active-source')

check(!engineTypes.includes("../programs"), 'Program engine types must not depend on a concrete program package')
check(!engineTypes.includes("../data"), 'Program engine types must not depend on legacy data facade')

for (const programDir of ['crownforge', 'crown-maintenance', 'black-crown']) {
  const dir = path.join(root, 'src/programs', programDir)
  check(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), `Missing program package directory: ${programDir}`)
  check(fs.existsSync(path.join(dir, 'index.ts')), `Missing program package entrypoint: ${programDir}/index.ts`)
  check(fs.existsSync(path.join(dir, 'metadata.ts')), `Missing program metadata: ${programDir}/metadata.ts`)
  check(fs.existsSync(path.join(dir, 'rules.ts')), `Missing program rules: ${programDir}/rules.ts`)
}

if (failures.length) {
  console.error(JSON.stringify({ result: 'FAIL', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  result: 'PASS',
  architecture: 'shared program engine + independent program packages + central registry',
  activePackages: ['crownforge', 'crown-maintenance', 'black-crown'],
  catalogPackages: [],
  compatibilityFacadeContainsPrescriptions: false,
}, null, 2))
