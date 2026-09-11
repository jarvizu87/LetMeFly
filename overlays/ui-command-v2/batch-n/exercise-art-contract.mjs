// Legacy import records remain readable but never authorize private image delivery.
export const MAP_KEY = 'privateExerciseArtMap'
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const PRIVATE_BUCKET = 'athlete-exercise-art'
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
export function privateDelivery(value, athleteId) {
  if (!UUID.test(athleteId || '') || value?.kind !== 'supabase-private' || value.bucket !== PRIVATE_BUCKET || !Array.isArray(value.parts) || ![1, 2, 3].includes(value.parts.length)) return null
  const parts = []
  for (const part of value.parts) {
    if (typeof part?.path !== 'string' || !part.path.startsWith(`${athleteId}/`) || !/^[0-9a-f]{64}\.(?:webp|png)$/.test(part.path.slice(athleteId.length + 1))) return null
    if (typeof part.label !== 'string' || !part.label.trim() || part.label.length > 100 || /[\x00-\x1f\x7f]/.test(part.label)) return null
    parts.push({ path: part.path, label: part.label.trim() })
  }
  if (new Set(parts.map(part => part.path)).size !== parts.length) return null
  return { kind: 'supabase-private', bucket: PRIVATE_BUCKET, parts }
}
export function approvedPrivateRows(rows, athleteId) {
  const grouped = new Map(), result = Object.create(null)
  if (!Array.isArray(rows)) return result
  for (const row of rows) {
    if (row?.athlete_id !== athleteId || row.status !== 'approved' || row.is_active !== true || row.deleted_at != null || !SLUG.test(row.exercise_key || '')) continue
    if (!grouped.has(row.exercise_key)) grouped.set(row.exercise_key, [])
    grouped.get(row.exercise_key).push(row)
  }
  for (const [key, matches] of grouped) {
    if (matches.length !== 1) continue
    const row = matches[0], delivery = privateDelivery(row.metadata?.delivery, athleteId)
    if (UUID.test(row.id || '') && delivery) result[key] = { id: row.id, delivery }
  }
  return result
}
export function assetRecord(value) {
  if (!value || value.status !== 'approved' || typeof value.publicId !== 'string') return null
  const publicId = value.publicId.trim(), format = value.format ?? 'webp'
  if (!publicId || publicId.length > 500 || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(publicId)) return null
  if (publicId.split('/').some(part => part === '.' || part === '..')) return null
  if (!['webp', 'png', 'jpg', 'jpeg', 'avif'].includes(format)) return null
  return { publicId, format, status: 'approved' }
}
export function cleanMap(value) {
  const result = Object.create(null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [key, asset] of Object.entries(value)) {
    const normalized = SLUG.test(key) && assetRecord(asset)
    if (normalized) result[key] = normalized
  }
  return result
}
export function scopedMap(value, athleteId) {
  return value?.formatVersion === 2 && value.athleteId === athleteId && athleteId ? cleanMap(value.overrides) : {}
}
export function parseArtImport(payload, athleteId) {
  if (payload?.format !== 'letmefly-private-exercise-art-map' || ![1, 2].includes(payload.formatVersion)) throw new Error('Choose a LetMeFly exercise-art map.')
  if (!athleteId) throw new Error('Open LetMeFly and select your athlete first.')
  if (payload.athleteId && payload.athleteId !== athleteId) throw new Error('This map belongs to a different athlete.')
  if (payload.formatVersion === 2 && !payload.athleteId) throw new Error('This map is missing its athlete identity.')
  const count = Object.keys(payload.overrides ?? {}).length, overrides = cleanMap(payload.overrides)
  if (!count || count > 500 || Object.keys(overrides).length !== count) throw new Error('Every entry needs a valid exercise key, image path, supported format and explicit approved status. Review the map before importing.')
  return { format: payload.format, formatVersion: 2, athleteId, overrides }
}
