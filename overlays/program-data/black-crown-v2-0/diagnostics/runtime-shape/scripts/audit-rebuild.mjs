import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const allSourceFiles = []
for (const dir of ['src', 'public']) walk(path.join(root, dir))
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|js|html|toml|json|webmanifest)$/i.test(entry.name)) allSourceFiles.push(full)
  }
}
const combined = allSourceFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(!/service[_ -]?role/i.test(combined), 'service-role credential wording/value must not be in client source')
assert(!/SUPABASE_SECRET_KEY|DATABASE_PASSWORD|DB_PASSWORD/i.test(combined), 'server secret name found in client source')
assert(!/localStorage\.setItem\s*\(/.test(combined), 'private app data must not be written to localStorage')
assert(!/\bJP\b/.test(read('src/main.ts')), 'personal athlete identity must not be hard-coded in app')

const sw = read('public/service-worker.js')
assert(sw.includes("endsWith('.supabase.co')"), 'service worker must bypass Supabase')
assert(sw.includes('/auth\\/v1') && sw.includes('/rest\\/v1'), 'service worker must bypass auth/private REST')

const netlify = read('netlify.toml')
assert(/script-src 'self'/.test(netlify), 'CSP must keep scripts self-only')
assert(netlify.includes('https://dvdooeipptaqelvlaept.supabase.co'), 'CSP must explicitly allow LetMeFly Supabase')

const crownforgeWeek1 = read('src/programs/crownforge/weeks/week-01.ts')
const crownforgeIndex = read('src/programs/crownforge/index.ts')
const compatibilityPrograms = read('src/data/programs.ts')
const blackCrownMetadata = read('src/programs/black-crown/metadata.ts')
assert(crownforgeWeek1.includes("start: '2026-09-07'"), 'Crownforge Week 1 start date missing')
assert(crownforgeWeek1.includes("date: '2026-09-13'"), 'Crownforge Week 1 rest day missing')
assert(crownforgeIndex.includes('CROWNFORGE_WEEK_14'), 'Crownforge modular package must assemble through Week 14')
assert(compatibilityPrograms.includes("export * from '../programs/registry'"), 'legacy program facade must delegate to modular registry')
assert(blackCrownMetadata.includes("status: 'catalog-only'"), 'Black Crown must remain catalog-only until full source import')

const packageJson = JSON.parse(read('package.json'))
assert(/^\d+\.\d+\.\d+$/.test(packageJson.dependencies['@supabase/supabase-js']), 'Supabase JS must be pinned')
assert(/^\d+\.\d+\.\d+$/.test(packageJson.devDependencies.vite), 'Vite must be pinned')

console.log(JSON.stringify({
  result: 'PASS',
  filesScanned: allSourceFiles.length,
  crownforgeOpeningWeek: '2026-09-07..2026-09-13',
  blackCrown: 'catalog-only',
  privateLocalStorageWrites: 0,
  scriptCsp: 'self-only',
}, null, 2))
