// Shared profile-only contract. Never accepts program, workout or training-max data.
export const PROFILE_FIELDS = Object.freeze({
  age: ['Age', 'age'], height: ['Height', 'height'],
  trainingExperience: ['Training experience', 'training_experience'],
  trainingHistory: ['Training history', 'training_history'],
  primaryGoal: ['Primary goal', 'primary_goal'], strengthGoals: ['Strength goals', 'strength_goals'],
  developmentPriorities: ['Development priorities', 'development_priorities'],
  preferredExercises: ['Preferred exercises / methods', 'preferred_exercises'],
  avoidExercises: ['Avoid / dislike', 'avoid_exercises'], equipment: ['Equipment available', 'equipment'],
  coachingNotes: ['Coaching notes', 'coaching_notes'],
})
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''

// A newly added cloud column is null until its first saved profile arrives.
// Preserve pre-migration local details; explicit remote objects (including {})
// remain authoritative. This does not mark clean local data as synced remotely.
export function preserveLocalProfileContext(payload, previous) {
  return payload.profile_context_v2 == null && object(previous?.profile_context_v2)
    ? { ...payload, profile_context_v2: previous.profile_context_v2 }
    : payload
}

export function profileValues(athlete) {
  const context = object(athlete?.profile_context_v2) ? athlete.profile_context_v2 : {}
  return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, [, legacy]]) => [key,
    text(context[key] ?? athlete?.[legacy] ?? (key === 'height' && athlete?.height_cm ? `${athlete.height_cm} cm` : ''))]))
}

export function validateProfilePatch(value) {
  if (!object(value)) throw new Error('Profile details must be a field map.')
  const patch = {}
  for (const [key, field] of Object.entries(value)) {
    if (!Object.hasOwn(PROFILE_FIELDS, key)) throw new Error('This file contains unsupported profile fields.')
    if (typeof field !== 'string' || field.length > (key === 'coachingNotes' ? 4000 : 2000)) throw new Error('Profile details must be text within the field length limit.')
    const clean = field.trim()
    if (key === 'age' && clean && (!/^\d+$/.test(clean) || Number(clean) < 10 || Number(clean) > 120)) throw new Error('Enter a valid age or leave it blank.')
    patch[key] = clean
  }
  return patch
}

export function parseProfileImport(raw, athleteId) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 65536) throw new Error('Choose a profile JSON file smaller than 64 KB.')
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('This is not a valid profile JSON file.') }
  if (!object(value) || value.format !== 'letmefly-athlete-profile' || value.formatVersion !== 1) throw new Error('Choose a LetMeFly athlete profile file. Workout backups use Restore instead.')
  const allowed = ['format', 'formatVersion', 'athleteId', 'displayName', 'profileContext', 'source']
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('This file contains data outside the athlete profile.')
  if (typeof athleteId !== 'string' || !athleteId.trim() || value.athleteId !== athleteId) throw new Error('This profile file belongs to a different athlete.')
  const fields = validateProfilePatch(value.profileContext)
  if (!Object.values(fields).some(Boolean)) throw new Error('This profile file has no filled details to import.')
  // Empty imported fields never erase current details. Clearing stays an explicit form edit.
  return { athleteId, fields: Object.fromEntries(Object.entries(fields).filter(([, field]) => field)),
    labels: Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, [label]]) => [key, label])) }
}

export function mergeProfilePatch(athlete, input, expectedInput, now) {
  const patch = validateProfilePatch(input), expected = validateProfilePatch(expectedInput), current = profileValues(athlete)
  if (Object.keys(patch).some(key => !Object.hasOwn(expected, key))) throw new Error('Reload Profile before saving these changes.')
  for (const [key, value] of Object.entries(patch)) {
    if (current[key] !== expected[key] && current[key] !== value) throw new Error('Your profile changed elsewhere. Reopen Profile before saving this field.')
  }
  if (Object.entries(patch).every(([key, value]) => current[key] === value)) return null
  return { ...(object(athlete.profile_context_v2) ? athlete.profile_context_v2 : {}), ...patch, updatedAt: now, version: 2 }
}
