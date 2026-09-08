#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node ci/audit-black-crown-exercise-coverage.mjs <target-source-dir>')
  process.exit(2)
}

const libraryPath = path.join(target, 'src/data/exercise-library.ts')
const libraryText = fs.readFileSync(libraryPath, 'utf8')
const names = []
const aliases = new Map()
for (const match of libraryText.matchAll(/(?:direct|plan|fallback)\('([^']+)'[^\n]*/g)) {
  names.push(match[1])
}
for (const match of libraryText.matchAll(/(?:direct|plan|fallback)\('([^']+)'[^\n]*\[([^\]]*)\]\),?$/gm)) {
  const canonical = match[1]
  for (const alias of match[2].matchAll(/'([^']+)'/g)) aliases.set(alias[1].toLowerCase(), canonical)
}

const manualAliases = new Map(Object.entries({
  'hpc': 'Hang Power Clean',
  'kb swing': 'Kettlebell Swing',
  'pallof': 'Pallof Press',
  'rear delt': 'Rear Deltoid Fly',
  'external rotation': 'Cable External Rotation',
  'ham curl': 'Hamstring Curl',
  'neutral-grip pulldown': 'Neutral-Grip Lat Pulldown',
  'incline db press': 'Incline DB Press',
  'strict ohp': 'Overhead Press',
  'med-ball chest pass': 'Medicine Ball Chest Pass',
  'medicine ball chest pass': 'Medicine Ball Chest Pass',
  'trap-3 raise': 'Trap-3 Raise',
  'reverse lunge': 'Reverse Lunge',
  'box jump': 'Box Jump',
  'broad jump': 'Broad Jump',
  'low box jump': 'Low Box Jump',
  'finger extension': 'Finger Extension',
  'hip airplane': 'Hip Airplane',
  'ankle rocker': 'Ankle Rock',
  '90/90 hip switch': '90/90 Hip Mobility',
  '90/90 hip mobility': '90/90 Hip Mobility',
  'empty bar patterning': 'Empty Bar Patterning',
  'explosive push-up': 'Explosive Push-Up',
  'cable hip-flexor march': 'Cable March',
  'standing cable hip flexor march': 'Cable March',
  'sorenson hold': 'Sorenson Hold',
  'bird dog hold': 'Bird Dog',
  'prowler push': 'Sled Push',
  'trap-bar carry': 'Farmer Carry',
  'assisted pull-up': 'Pull-Up',
}))

const canonicalLower = new Map(names.map((name) => [name.toLowerCase(), name]))
const searchable = [...canonicalLower.keys(), ...aliases.keys(), ...manualAliases.keys()].sort((a, b) => b.length - a.length)

function matchesExercise(line) {
  const lower = line.toLowerCase()
  return searchable.some((needle) => lower.includes(needle))
}

const sourceDir = path.join(target, 'src/programs/black-crown/source-weeks')
const uncovered = []
let prescriptionLines = 0
for (let week = 1; week <= 54; week += 1) {
  const text = fs.readFileSync(path.join(sourceDir, `week-${String(week).padStart(2, '0')}.ts`), 'utf8')
  for (const m of text.matchAll(/prescription:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const value = JSON.parse(`"${m[1]}"`)
    for (const raw of value.split(/\n|\s+\+\s+|;\s+/)) {
      const line = raw.trim()
      if (!line) continue
      if (!/(?:\b\d+\s*[x×]\s*\d|\b\d+\s*x\s*\d|\b\d+%|\bRPE\s*\d|\byards?\b|\byd\b|\bseconds?\b|\bminutes?\b|\bsets?\b|Attempt\s+\d)/i.test(line)) continue
      prescriptionLines += 1
      if (matchesExercise(line)) continue
      if (/^(?:rest|quality|placement|order note|stop|choose one|optional|none|no |local source|only source|one finisher|lift-specific ramp|set projected|enter made|highest successful|warm-up|easy restoration)/i.test(line)) continue
      if (/^\d+\s*[x×]/i.test(line)) continue
      uncovered.push({ week, line })
    }
  }
}

const unique = [...new Map(uncovered.map((x) => [`${x.week}:${x.line}`, x])).values()]
console.log(JSON.stringify({ result: unique.length ? 'REVIEW' : 'PASS', prescriptionLinesScanned: prescriptionLines, uncoveredCount: unique.length, uncovered: unique.slice(0, 120) }, null, 2))
if (unique.length > 120) console.log(`... ${unique.length - 120} additional uncovered lines omitted`)
