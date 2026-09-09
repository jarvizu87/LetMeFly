#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/.build-src/letmefly_app/dist}"
DATA="$DIST_DIR/data/exercise-intelligence-v1.json"
SUPPLEMENT="$ROOT_DIR/overlays/exercise-intelligence/program-name-coverage-supplement-v1.json"

for required in "$DATA" "$SUPPLEMENT"; do
  test -s "$required"
done

DATA="$DATA" SUPPLEMENT="$SUPPLEMENT" node - <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const dataPath = process.env.DATA;
const supplementPath = process.env.SUPPLEMENT;
const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const supplement = JSON.parse(fs.readFileSync(supplementPath, 'utf8'));

if (payload.schemaVersion !== '1.2-active-program-coverage') {
  throw new Error(`Program-name coverage requires 1.2 active-program payload, got ${payload.schemaVersion}`);
}
if (payload.counts?.exercises !== 108 || payload.counts?.substitutionRules !== 27) {
  throw new Error(`Program-name coverage requires 108/27 input, got ${payload.counts?.exercises}/${payload.counts?.substitutionRules}`);
}
if (supplement.supplementId !== 'program-name-coverage-v1') {
  throw new Error(`Unexpected program-name supplement ID: ${supplement.supplementId}`);
}
if (!Array.isArray(supplement.exercises) || supplement.exercises.length !== 4) {
  throw new Error(`Program-name supplement must contain exactly four canonical movement records, got ${supplement.exercises?.length}`);
}
if (!Array.isArray(supplement.additionalCompoundProgramDisplayNames) || supplement.additionalCompoundProgramDisplayNames.length !== 7) {
  throw new Error('Program-name supplement must declare exactly seven additional program-owned choice/ambiguity labels');
}
if (!Array.isArray(supplement.programControlDisplayNames) || supplement.programControlDisplayNames.length !== 7) {
  throw new Error('Program-name supplement must declare exactly seven non-exercise program-control/rest labels');
}

const originalRuleDigest = crypto.createHash('sha256').update(JSON.stringify(payload.substitutionRules)).digest('hex');
const existingIds = new Set(payload.exercises.map((exercise) => exercise.id));
const existingNames = new Set(payload.exercises.map((exercise) => String(exercise.canonicalName || '').toLowerCase()));
for (const exercise of supplement.exercises) {
  if (!exercise.id || !exercise.canonicalName) throw new Error('Program-name supplement exercise is missing identity');
  if (existingIds.has(exercise.id)) throw new Error(`Program-name supplement duplicates exercise ID: ${exercise.id}`);
  if (existingNames.has(exercise.canonicalName.toLowerCase())) throw new Error(`Program-name supplement duplicates canonical name: ${exercise.canonicalName}`);
  if (!exercise.trainingCategory || !exercise.purpose || !exercise.movementRoles?.length ||
      !exercise.coachingCues?.length || !exercise.commonMistakes?.length ||
      exercise.reviewStatus !== 'READY FOR REVIEW') {
    throw new Error(`Incomplete program-name Exercise Intelligence record: ${exercise.id}`);
  }
  if (exercise?.demo?.currentStatus !== 'search-fallback' ||
      !String(exercise?.demo?.currentUrl || '').startsWith('https://www.youtube.com/results?search_query=') ||
      exercise?.demo?.candidateRequiresValidation !== false) {
    throw new Error(`Program-name demo governance mismatch: ${exercise.id}`);
  }
}

const compound = [...new Set([
  ...(payload.compoundProgramDisplayNames || []),
  ...supplement.additionalCompoundProgramDisplayNames,
])];
if (compound.length !== 20) {
  throw new Error(`Expected 20 governed program-owned choice/ambiguity labels, got ${compound.length}`);
}
const controls = [...new Set(supplement.programControlDisplayNames)];
if (controls.length !== 7) {
  throw new Error(`Expected 7 unique program-control/rest labels, got ${controls.length}`);
}
for (const name of controls) {
  if (compound.includes(name)) throw new Error(`Program-owned label is declared as both choice and control: ${name}`);
}

payload.exercises.push(...supplement.exercises);
payload.schemaVersion = '1.3-program-name-coverage';
payload.programNameCoverageSupplements = ['program-name-coverage-v1'];
payload.compoundProgramDisplayNames = compound;
payload.programControlDisplayNames = controls;
payload.counts = {
  ...payload.counts,
  exercises: payload.exercises.length,
  substitutionRules: payload.substitutionRules.length,
  roleCoverage: payload.exercises.filter((exercise) => Array.isArray(exercise.movementRoles) && exercise.movementRoles.length).length,
  coachingCoverage: payload.exercises.filter((exercise) => Boolean(exercise.purpose) && exercise.coachingCues?.length && exercise.commonMistakes?.length).length,
  readyForReview: payload.exercises.filter((exercise) => exercise.reviewStatus === 'READY FOR REVIEW').length,
};

const finalRuleDigest = crypto.createHash('sha256').update(JSON.stringify(payload.substitutionRules)).digest('hex');
if (finalRuleDigest !== originalRuleDigest) throw new Error('Program-name coverage modified governed substitution rules');
const ids = new Set(payload.exercises.map((exercise) => exercise.id));
if (ids.size !== 112 || payload.exercises.length !== 112) throw new Error(`Program-name coverage final exercise identity mismatch: ${ids.size}/${payload.exercises.length}`);
for (const key of ['exercises', 'roleCoverage', 'coachingCoverage', 'readyForReview']) {
  if (payload.counts[key] !== 112) throw new Error(`Program-name coverage ${key} mismatch: ${payload.counts[key]}`);
}
if (payload.counts.substitutionRules !== 27) throw new Error(`Program-name coverage substitution count changed: ${payload.counts.substitutionRules}`);

fs.writeFileSync(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log('LetMeFly final program-name Exercise Intelligence coverage: PASS (112/27; 20 choice labels; 7 control/rest labels)');
NODE
