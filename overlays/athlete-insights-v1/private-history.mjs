// Read one consistent snapshot. Athlete selection matches getActiveAthlete().
const STORES = { athletes: 'athletes', preferences: 'athletePreferences', programs: 'programInstances', readiness: 'readinessEntries', sessions: 'workoutSessions', exercises: 'workoutExercises', sets: 'workoutSets' }

export async function readPrivateHistory(factory = globalThis.indexedDB) {
  if (!factory) return null
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('letmefly-private')
    request.onupgradeneeded = () => request.transaction.abort()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Private history is temporarily unavailable'))
    request.onsuccess = () => resolve(request.result)
  })
  try {
    for (const name of Object.values(STORES)) if (!db.objectStoreNames.contains(name)) throw new Error('Private history schema is incomplete')
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(Object.values(STORES), 'readonly')
      const result = {}
      tx.oncomplete = () => resolve(result)
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Private history read failed'))
      for (const [key, name] of Object.entries(STORES)) {
        const request = tx.objectStore(name).getAll()
        request.onsuccess = () => { result[key] = request.result }
      }
    })
    const athlete = rows.athletes.find(row => !row.deleted_at)
    if (!athlete) return null
    const owned = Object.fromEntries(Object.entries(rows).filter(([key]) => key !== 'athletes').map(([key, items]) => [key, items.filter(row => row.athlete_id === athlete.id && !row.deleted_at)]))
    return { athlete, ...owned }
  } finally { db.close() }
}

export function historyWindows(range, now = new Date()) {
  const until = now.toISOString()
  if (range === 'all') return { current: { from: '1970-01-01T00:00:00.000Z', until }, previous: null }
  // Exact rolling durations make the two comparison windows equal across DST.
  const duration = (range === '7d' ? 7 : 30) * 86400000
  const from = new Date(now.getTime() - duration).toISOString()
  return { current: { from, until }, previous: { from: new Date(now.getTime() - 2 * duration).toISOString(), until: from } }
}
