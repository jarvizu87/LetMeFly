// Mapping approval is explicit; Cloudinary public delivery is not an access boundary.
export const MAP_KEY = 'privateExerciseArtMap'
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
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
