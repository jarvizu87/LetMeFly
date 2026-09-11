import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProfileImport, mergeProfilePatch, profileValues, preserveLocalProfileContext } from '../overlays/profile-context-v1/contract.mjs'
const athlete = { id: 'qa', primary_goal: 'Old goal', profile_context_v2: { primaryGoal: '', equipmentAccess: { rack: { availability: 'available' } } } }
const file = fields => JSON.stringify({ format: 'letmefly-athlete-profile', formatVersion: 1, athleteId: 'qa', profileContext: fields })
test('profile import is identity-bound and cannot import workout or training-max data', () => {
  assert.throws(() => parseProfileImport(file({ primaryGoal: 'Goal' }), 'other'), /different athlete/)
  assert.throws(() => parseProfileImport(file({ trainingMaxes: '200' }), 'qa'), /unsupported/)
  assert.throws(() => parseProfileImport(JSON.stringify({ format: 'letmefly-athlete-backup', payload: {} }), 'qa'), /Restore/)
  assert.throws(() => parseProfileImport('{"format":"letmefly-athlete-profile","formatVersion":1,"athleteId":"qa","profileContext":{"primaryGoal":"Goal"},"workoutSets":[]}', 'qa'), /outside/)
})
test('empty imported fields are omitted and literal text stays text', () => {
  const result = parseProfileImport(file({ primaryGoal: '<img src=x onerror=alert(1)>', equipment: '' }), 'qa')
  assert.deepEqual(result.fields, { primaryGoal: '<img src=x onerror=alert(1)>' })
  assert.throws(() => parseProfileImport(file({ primaryGoal: '' }), 'qa'), /no filled/)
})
test('malformed values, prototype keys and unreasonable field sizes are rejected', () => {
  for (const value of [null, [], { primaryGoal: {} }, { age: 'NaN' }, { age: '9' }, { age: '38.5' }, { primaryGoal: 'x'.repeat(2001) }]) assert.throws(() => parseProfileImport(file(value), 'qa'))
  assert.throws(() => parseProfileImport(file(JSON.parse('{"__proto__":{"polluted":true}}')), 'qa'), /unsupported/)
  assert.throws(() => parseProfileImport('x'.repeat(65537), 'qa'), /64 KB/)
  assert.equal({}.polluted, undefined)
})
test('patch preserves concurrent unrelated context and keeps cleared legacy values blank', () => {
  const before = structuredClone(athlete)
  const next = mergeProfilePatch(athlete, { trainingHistory: 'Experienced' }, { trainingHistory: '' }, '2026-09-11T00:00:00Z')
  assert.equal(next.primaryGoal, '')
  assert.deepEqual(next.equipmentAccess, athlete.profile_context_v2.equipmentAccess)
  assert.deepEqual(athlete, before)
  assert.equal(profileValues(athlete).primaryGoal, '')
})
test('stale edits reject atomically while repeat saves are idempotent', () => {
  const current = { id: 'qa', profile_context_v2: { primaryGoal: 'Newer goal', equipment: 'Rack' } }
  assert.throws(() => mergeProfilePatch(current, { primaryGoal: 'Old draft', equipment: 'Cable' }, { primaryGoal: 'Old goal', equipment: 'Rack' }, 'now'), /changed elsewhere/)
  assert.throws(() => mergeProfilePatch(current, { primaryGoal: 'Goal' }, {}, 'now'), /Reload/)
  assert.equal(mergeProfilePatch(current, { primaryGoal: 'Newer goal' }, { primaryGoal: 'Old goal' }, 'now'), null)
  assert.equal(current.profile_context_v2.equipment, 'Rack')
})
test('manual clear is explicit and changes only selected fields', () => {
  const current = { id: 'qa', profile_context_v2: { primaryGoal: 'Goal', height: '180 cm' } }
  const next = mergeProfilePatch(current, { primaryGoal: '' }, { primaryGoal: 'Goal' }, 'now')
  assert.equal(next.primaryGoal, ''); assert.equal(next.height, '180 cm')
})
test('nullable cloud-column rollout preserves local context without blocking explicit remote objects', () => {
  const previous = { profile_context_v2: { age: '39', height: '5 ft 6 in' } }
  for (const payload of [{ revision: 2 }, { revision: 2, profile_context_v2: null }]) {
    assert.deepEqual(preserveLocalProfileContext(payload, previous).profile_context_v2, previous.profile_context_v2)
    assert.equal(payload.profile_context_v2 == null, true)
  }
  for (const profile_context_v2 of [{}, { age: '' }, { age: '40' }]) {
    const payload = { profile_context_v2 }
    assert.equal(preserveLocalProfileContext(payload, previous), payload)
  }
})
