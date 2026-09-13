import { FIVE_ATHLETE_FIXTURES, validateFiveAthleteFixtures } from './five-athlete-fixtures.mjs'

export async function seedFiveAthleteFixture(page, fixture) {
  validateFiveAthleteFixtures()
  if (!FIVE_ATHLETE_FIXTURES.some(row => row.key === fixture.key)) throw new Error(`Unknown five-athlete fixture: ${fixture.key}`)
  return page.evaluate(async input => {
    const q = window.__LMF_FIVE_ATHLETE_QA__
    if (!q) throw new Error('Five-athlete QA service bridge is not available.')
    const existing = await q.athlete.getActiveAthlete()
    if (existing) throw new Error('Five-athlete fixture must seed into a fresh disposable browser context.')

    const athlete = await q.athlete.createLocalAthlete({ displayName: input.displayName, weightUnit: input.weightUnit })
    for (const [exerciseKey, [value, unit]] of Object.entries(input.trainingMaxes)) {
      await q.athlete.setTrainingMax(athlete.id, exerciseKey, value, unit)
    }

    const expectedBlank = Object.fromEntries(Object.keys(input.profile).map(key => [key, '']))
    await q.profile.saveProfileContext(athlete.id, input.profile, expectedBlank)
    const readiness = await q.readiness.saveReadiness(athlete.id, input.readiness)
    const programInstance = await q.athlete.getCurrentProgramInstance(athlete.id)
    const latestTms = await q.athlete.getLatestTrainingMaxes(athlete.id)

    const stores = ['athletes', 'athletePreferences', 'programInstances', 'trainingMaxHistory', 'readinessEntries', 'workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox']
    const db = await q.db.openLetMeFlyDb()
    const snapshot = {}
    try {
      const tx = db.transaction(stores, 'readonly')
      await Promise.all(stores.map(name => new Promise((resolve, reject) => {
        const request = tx.objectStore(name).getAll()
        request.onsuccess = () => { snapshot[name] = request.result; resolve() }
        request.onerror = () => reject(request.error)
      })))
    } finally { db.close() }

    const own = rows => rows.filter(row => row?.athlete_id === athlete.id && !row.deleted_at)
    return {
      fixtureKey: input.key,
      athleteId: athlete.id,
      displayName: athlete.display_name,
      weightUnit: input.weightUnit,
      programInstance,
      readinessId: readiness.id,
      tmKeys: Object.keys(latestTms).sort(),
      ownCounts: Object.fromEntries(stores.map(name => [name, own(snapshot[name] ?? []).length])),
      foreignAthleteRows: snapshot.athletes.filter(row => row.id !== athlete.id && !row.deleted_at).length,
      profileContext: snapshot.athletes.find(row => row.id === athlete.id)?.profile_context_v2 ?? null,
    }
  }, fixture)
}

export async function seedAllFiveAthleteFixtures(createPage) {
  validateFiveAthleteFixtures()
  const results = []
  for (const fixture of FIVE_ATHLETE_FIXTURES) {
    const { page, close } = await createPage(fixture)
    try {
      results.push(await seedFiveAthleteFixture(page, fixture))
    } finally {
      await close()
    }
  }
  return results
}
