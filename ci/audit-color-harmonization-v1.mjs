import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const cssPath = path.join(dist, 'ui', 'color-harmonization-v1.css')
const indexPath = path.join(dist, 'index.html')
const swPath = path.join(dist, 'service-worker.js')

const assert = (condition, message) => { if (!condition) throw new Error(message) }
assert(fs.existsSync(cssPath), 'Missing color-harmonization-v1.css')
assert(fs.statSync(cssPath).size > 0, 'Empty color-harmonization-v1.css')

const css = fs.readFileSync(cssPath, 'utf8')
const index = fs.readFileSync(indexPath, 'utf8')
const sw = fs.readFileSync(swPath, 'utf8')

for (const token of ['--lmf-brand-red:#e31b2f','--lmf-energy-purple:#a855f7']) assert(css.includes(token), `Missing palette token: ${token}`)
for (const route of ['program','progress','exercises','coach','profile','more']) assert(css.includes(`data-lmf-approved-route='${route}'`), `Missing harmonized route: ${route}`)
for (const interactionRule of ['.toast{pointer-events:none!important}', 'body:has(.workout-panel .active-exercise) #lmf-install-banner{display:none!important}']) assert(css.includes(interactionRule), `Missing workout interaction safety rule: ${interactionRule}`)
for (const fidelityRule of [
  "html[data-lmf-approved-route='profile'] .profile-hero{display:none!important}",
  "html[data-lmf-approved-route='profile'] .lmf-profile-character-sheet-v1{grid-template-columns:1fr!important}",
  "html[data-lmf-approved-route='more'] .lmf-more-v1{--lmf-more-accent:var(--lmf-brand-red)!important",
  "html[data-lmf-approved-route='more'] .lmf-more-brand-v1 .lmf-official-more-logo{display:none!important}",
]) assert(css.includes(fidelityRule), `Missing locked-mockup fidelity rule: ${fidelityRule}`)
for (const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','setItem(','workoutSessions','trainingMaxHistory','programInstances']) assert(!css.includes(forbidden), `Color layer contains forbidden behavior token: ${forbidden}`)
assert(index.includes('/ui/color-harmonization-v1.css'), 'index.html missing color harmonization stylesheet')
assert(sw.includes('/ui/color-harmonization-v1.css'), 'service-worker missing color harmonization stylesheet')
assert(index.indexOf('/ui/color-harmonization-v1.css') > index.indexOf('/ui/app-consistency-v1.css'), 'Color harmonization must load after shared app consistency CSS')
assert(index.indexOf('/ui/color-harmonization-v1.css') > index.indexOf('/ui/approved-tab-redesigns-v1.css'), 'Color harmonization must load after approved tab redesign CSS')

console.log('LetMeFly color harmonization production audit: PASS')
