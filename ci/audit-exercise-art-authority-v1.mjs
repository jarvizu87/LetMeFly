#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || '.build-src/letmefly_app')
const dist = path.join(root, 'dist')
const indexPath = path.join(dist, 'index.html')
const authorityCssPath = path.join(dist, 'ui', 'exercise-art-authority-v1.css')
const authorityJsPath = path.join(dist, 'ui', 'exercise-art-authority-v1.js')

for (const file of [indexPath, authorityCssPath, authorityJsPath]) {
  if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error(`Missing exercise-art authority artifact: ${file}`)
}

const index = fs.readFileSync(indexPath, 'utf8')
const authorityCss = fs.readFileSync(authorityCssPath, 'utf8')
const authorityJs = fs.readFileSync(authorityJsPath, 'utf8')
const allCss = fs.readdirSync(path.join(dist, 'assets'))
  .filter(name => name.endsWith('.css'))
  .map(name => fs.readFileSync(path.join(dist, 'assets', name), 'utf8'))
  .join('\n')

const required = [
  '/ui/exercise-art-authority-v1.css?v=1',
  '/ui/exercise-art-authority-v1.js?v=1',
]
for (const marker of required) {
  if (!index.includes(marker)) throw new Error(`Production index is missing ${marker}`)
}
if (index.indexOf('/ui/exercise-art-authority-v1.css?v=1') < index.indexOf('/ui/approved-tab-redesigns-v1.css')) {
  throw new Error('Exact exercise-art authority CSS is not after the approved Exercises layer')
}

const authoritySelector = "html[data-lmf-approved-route='exercises'] body\\n.lmf-approved-exercises-layout-v1 .exercise-library\\n.library-card .library-thumb[data-exercise-art]"
if (!authorityCss.includes("html[data-lmf-approved-route='exercises'] body") ||
    !authorityCss.includes('.library-card .library-thumb[data-exercise-art]') ||
    !authorityCss.includes('var(--exercise-art,var(--v2-mountain))!important')) {
  throw new Error('Exact exercise-art authority rule is incomplete')
}
if (authorityCss.includes('--v2-lifter') || authorityCss.includes('train-lifter')) {
  throw new Error('Exact exercise-art authority must never reference the generic lifter image')
}
if (!authorityJs.includes("attributeFilter: ['style', 'data-exercise-art', 'data-exercise-art-source', 'data-exercise-art-parts']")) {
  throw new Error('Selected exercise detail is not watching asynchronous exact-art resolution')
}
if (!authorityJs.includes("source.style.getPropertyValue('--exercise-art')") || !authorityJs.includes('computedBackground')) {
  throw new Error('Selected exercise detail does not fingerprint the resolved private artwork')
}

// This is the legacy rule that caused Back Squat, Bench Press, and Backward Sled
// Drag to all display train-lifter.webp. It may remain for old cards with no exact
// art key, but it must never beat a canonical [data-exercise-art] selector.
const legacyBarbell = /\.library-card\[data-filter-tags[~*]?=["']?barbell["']?\][^{,]*\.library-thumb[^{]*\{[^}]*--v2-lifter/s.test(allCss)
const legacySled = /\.library-card\[data-filter-tags[~*]?=["']?sled["']?\][^{,]*\.library-thumb[^{]*\{[^}]*--v2-lifter/s.test(allCss)
if (!(legacyBarbell || legacySled)) {
  console.warn('Legacy category lifter rule was not found; exact-art authority is still required as a regression boundary.')
}

// Approximate CSS specificity for the two relevant selectors. IDs, then
// class/attribute/pseudo-class count, then element count. The authority selector
// intentionally wins even if a legacy rule also carries !important.
function specificity(selector) {
  const ids = (selector.match(/#[A-Za-z0-9_-]+/g) || []).length
  const classes = (selector.match(/\.[A-Za-z0-9_-]+/g) || []).length
  const attrs = (selector.match(/\[[^\]]+\]/g) || []).length
  const pseudos = (selector.match(/:(?!:)[A-Za-z0-9_-]+(?:\([^)]*\))?/g) || []).length
  const stripped = selector
    .replace(/#[A-Za-z0-9_-]+/g, ' ')
    .replace(/\.[A-Za-z0-9_-]+/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/::?[A-Za-z0-9_-]+(?:\([^)]*\))?/g, ' ')
    .replace(/[>+~*,]/g, ' ')
  const elements = stripped.split(/\s+/).filter(token => /^[A-Za-z][A-Za-z0-9-]*$/.test(token)).length
  return [ids, classes + attrs + pseudos, elements]
}
function greater(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}
const exact = "html[data-lmf-approved-route='exercises'] body .lmf-approved-exercises-layout-v1 .exercise-library .library-card .library-thumb[data-exercise-art]"
const legacy = '.library-card[data-filter-tags~=barbell] .library-thumb'
const exactSpec = specificity(exact)
const legacySpec = specificity(legacy)
if (!greater(exactSpec, legacySpec)) {
  throw new Error(`Exact-art selector does not outrank legacy category selector: ${exactSpec} <= ${legacySpec}`)
}

console.log(`Exercise art authority v1: PASS (specificity ${exactSpec.join(',')} > legacy ${legacySpec.join(',')}; exact private art cannot be replaced by category lifter art)`)
