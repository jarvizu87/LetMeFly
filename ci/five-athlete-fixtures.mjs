// Reusable, synthetic release-gate athletes.
// QA-only: these definitions must never be copied into src/ or dist/.
// Each audit run creates them inside disposable browser storage.

export const FIVE_ATHLETE_FIXTURES = Object.freeze([
  Object.freeze({
    key: 'rook',
    displayName: 'QA 01 Rook',
    weightUnit: 'lb',
    viewport: Object.freeze({ width: 360, height: 800, mobile: true }),
    trainingMaxes: Object.freeze({
      'front-squat': [95, 'lb'],
      'back-squat': [115, 'lb'],
      'bench-press': [85, 'lb'],
      'deadlift': [135, 'lb'],
      'overhead-press': [55, 'lb'],
      clean: [65, 'lb'],
    }),
    readiness: Object.freeze({ sleepQuality: 4, soreness: 2, stress: 2, energy: 4, sleepHours: 8, notes: 'Five-athlete QA Rook' }),
    profile: Object.freeze({
      age: '24',
      trainingExperience: 'Beginner strength trainee',
      trainingHistory: 'QA-ROOK-HISTORY',
      primaryGoal: 'QA-ROOK-GOAL rebuild strength and movement quality',
      strengthGoals: 'Build consistent technique before aggressive loading',
      developmentPriorities: 'Squat mechanics, work capacity, trunk control',
      preferredExercises: 'Goblet squat, sled drag, carries',
      avoidExercises: 'None for QA',
      equipment: 'Barbell, rack, bench, dumbbells, sled',
      coachingNotes: 'QA-ROOK-COACH-MARKER',
    }),
  }),
  Object.freeze({
    key: 'forge',
    displayName: 'QA 02 Forge',
    weightUnit: 'lb',
    viewport: Object.freeze({ width: 412, height: 915, mobile: true }),
    trainingMaxes: Object.freeze({
      'front-squat': [165, 'lb'],
      'back-squat': [205, 'lb'],
      'bench-press': [185, 'lb'],
      'deadlift': [225, 'lb'],
      'overhead-press': [115, 'lb'],
      clean: [135, 'lb'],
    }),
    readiness: Object.freeze({ sleepQuality: 3, soreness: 2, stress: 3, energy: 3, sleepHours: 7, notes: 'Five-athlete QA Forge' }),
    profile: Object.freeze({
      age: '35',
      trainingExperience: 'Intermediate recreational lifter',
      trainingHistory: 'QA-FORGE-HISTORY',
      primaryGoal: 'QA-FORGE-GOAL build strength and work capacity',
      strengthGoals: 'Progress the main lifts without changing program structure',
      developmentPriorities: 'Posterior chain, pressing strength, conditioning',
      preferredExercises: 'Front squat, bench press, kettlebells',
      avoidExercises: 'Jump lunges',
      equipment: 'Full commercial gym, sled, kettlebells',
      coachingNotes: 'QA-FORGE-COACH-MARKER',
    }),
  }),
  Object.freeze({
    key: 'titan',
    displayName: 'QA 03 Titan',
    weightUnit: 'lb',
    viewport: Object.freeze({ width: 1440, height: 1000, mobile: false }),
    trainingMaxes: Object.freeze({
      'front-squat': [275, 'lb'],
      'back-squat': [335, 'lb'],
      'bench-press': [275, 'lb'],
      'deadlift': [405, 'lb'],
      'overhead-press': [185, 'lb'],
      clean: [225, 'lb'],
    }),
    readiness: Object.freeze({ sleepQuality: 5, soreness: 1, stress: 1, energy: 5, sleepHours: 8.5, notes: 'Five-athlete QA Titan' }),
    profile: Object.freeze({
      age: '41',
      trainingExperience: 'Advanced strength athlete',
      trainingHistory: 'QA-TITAN-HISTORY',
      primaryGoal: 'QA-TITAN-GOAL preserve prescription fidelity at higher loads',
      strengthGoals: 'Develop maximal strength while respecting governed progression',
      developmentPriorities: 'Heavy strength, explosive pulls, resilient conditioning',
      preferredExercises: 'Back squat, deadlift, Olympic derivatives',
      avoidExercises: 'None for QA',
      equipment: 'Full strength facility with platforms and specialty bars',
      coachingNotes: 'QA-TITAN-COACH-MARKER',
    }),
  }),
  Object.freeze({
    key: 'metric',
    displayName: 'QA 04 Metric',
    weightUnit: 'kg',
    viewport: Object.freeze({ width: 412, height: 915, mobile: true }),
    trainingMaxes: Object.freeze({
      'front-squat': [80, 'kg'],
      'back-squat': [100, 'kg'],
      'bench-press': [75, 'kg'],
      'deadlift': [125, 'kg'],
      'overhead-press': [50, 'kg'],
      clean: [60, 'kg'],
    }),
    readiness: Object.freeze({ sleepQuality: 4, soreness: 2, stress: 2, energy: 4, sleepHours: 7.5, notes: 'Five-athlete QA Metric' }),
    profile: Object.freeze({
      age: '29',
      trainingExperience: 'Intermediate metric-unit athlete',
      trainingHistory: 'QA-METRIC-HISTORY',
      primaryGoal: 'QA-METRIC-GOAL verify kg display and athlete-specific calculations',
      strengthGoals: 'Progress strength using metric units',
      developmentPriorities: 'Technique, balanced volume, conditioning',
      preferredExercises: 'Front squat, rows, carries',
      avoidExercises: 'None for QA',
      equipment: 'Metric plates, 20 kg bar, rack, cables',
      coachingNotes: 'QA-METRIC-COACH-MARKER',
    }),
  }),
  Object.freeze({
    key: 'recovery',
    displayName: 'QA 05 Recovery',
    weightUnit: 'lb',
    viewport: Object.freeze({ width: 390, height: 844, mobile: true }),
    trainingMaxes: Object.freeze({
      'front-squat': [135, 'lb'],
      'back-squat': [165, 'lb'],
      'bench-press': [125, 'lb'],
      'deadlift': [185, 'lb'],
      'overhead-press': [85, 'lb'],
      clean: [95, 'lb'],
    }),
    readiness: Object.freeze({ sleepQuality: 2, soreness: 4, stress: 4, energy: 2, sleepHours: 5.5, notes: 'Five-athlete QA Recovery' }),
    profile: Object.freeze({
      age: '52',
      trainingExperience: 'Experienced athlete returning from a high-fatigue week',
      trainingHistory: 'QA-RECOVERY-HISTORY',
      primaryGoal: 'QA-RECOVERY-GOAL verify readiness-aware UI without rewriting the program',
      strengthGoals: 'Maintain consistency while respecting readiness limits',
      developmentPriorities: 'Recovery, movement quality, technical consistency',
      preferredExercises: 'Tempo work, carries, sled work',
      avoidExercises: 'High-impact jumps',
      equipment: 'Rack, bench, barbell, cables, sled',
      coachingNotes: 'QA-RECOVERY-COACH-MARKER',
    }),
  }),
])

export function validateFiveAthleteFixtures(fixtures = FIVE_ATHLETE_FIXTURES) {
  if (!Array.isArray(fixtures) || fixtures.length !== 5) throw new Error('Five-athlete release gate requires exactly five fixtures.')
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) throw new Error(`Five-athlete fixtures need unique ${label}.`)
  }
  unique(fixtures.map(x => x.key), 'keys')
  unique(fixtures.map(x => x.displayName), 'display names')
  unique(fixtures.map(x => x.profile.primaryGoal), 'primary-goal markers')
  unique(fixtures.map(x => x.profile.coachingNotes), 'coach markers')
  for (const fixture of fixtures) {
    if (!['lb', 'kg'].includes(fixture.weightUnit)) throw new Error(`${fixture.key}: invalid weight unit`)
    if (!fixture.viewport?.width || !fixture.viewport?.height) throw new Error(`${fixture.key}: viewport missing`)
    for (const lift of ['front-squat', 'back-squat', 'bench-press', 'deadlift', 'overhead-press', 'clean']) {
      const row = fixture.trainingMaxes?.[lift]
      if (!Array.isArray(row) || !Number.isFinite(row[0]) || row[0] <= 0 || !['lb', 'kg'].includes(row[1])) throw new Error(`${fixture.key}: invalid ${lift} TM`)
    }
    if (!fixture.profile?.primaryGoal || !fixture.profile?.coachingNotes) throw new Error(`${fixture.key}: profile markers missing`)
  }
  return true
}

validateFiveAthleteFixtures()
