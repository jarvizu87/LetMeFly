// A forced refresh must include writes that happened after an older read began.
// Coalesce readers, but discard reads from before the latest invalidation.
export function createHistoryCache(read, { now = Date.now, maxAgeMs = 3000 } = {}) {
  let revision = 0, savedRevision = -1, value = null, readAt = 0, pending = null
  const invalidate = () => { revision++ }
  async function get({ force = false } = {}) {
    if (force) invalidate()
    while (savedRevision !== revision || now() - readAt > maxAgeMs) {
      if (!pending) {
        const attempt = { revision, promise: null }
        attempt.promise = Promise.resolve().then(read).then(data => {
          if (attempt.revision !== revision) return
          value = data; savedRevision = attempt.revision; readAt = now()
        }).finally(() => { if (pending === attempt) pending = null })
        pending = attempt
      }
      const attempt = pending
      try { await attempt.promise }
      catch (error) { if (attempt.revision === revision) throw error }
    }
    return value
  }
  return Object.freeze({ get, invalidate })
}
