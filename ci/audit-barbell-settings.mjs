import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBarbellSettings } from '../overlays/barbell-settings-v1/contract.mjs'
const defaults = { unit: 'lb', barLb: 45, barKg: 20, pairsLb: { '55': 2, '45': 6, '35': 2, '25': 4, '10': 4, '5': 4, '2.5': 4, '1.25': 2 }, pairsKg: { '25': 2, '20': 6, '15': 2, '10': 4, '5': 4, '2.5': 4, '1.25': 4, '0.5': 2 } }
const preference = { weight_unit: 'lb', preferences: { barbell: { barWeight: 45, plates: [45, 25, 10, 5, 2.5] } } }
test('saved athlete bar and denominations replace incompatible defaults without inventing pair quantities', () => {
  const result = resolveBarbellSettings(defaults, null, preference)
  assert.equal(result.barLb, 45)
  assert.deepEqual(result.knownPlatesLb, [45, 25, 10, 5, 2.5])
  assert.equal(result.inventoryConfirmedLb, false)
  assert.ok(Object.values(result.pairsLb).every(count => count === 0))
  assert.deepEqual(result.pairsKg, defaults.pairsKg)
  assert.equal(result.barKg, 20)
})
test('explicit device overrides win and unconfirmed drafts stay unconfirmed', () => {
  const saved = { barLb: 35, pairsLb: { '45': 2, '25': 1 }, inventoryConfirmedLb: true }
  const result = resolveBarbellSettings(defaults, saved, preference)
  assert.equal(result.barLb, 35); assert.equal(result.pairsLb['45'], 2)
  assert.equal(result.pairsLb['55'], 0); assert.equal(result.pairsLb['35'], 0); assert.equal(result.pairsLb['1.25'], 0)
  assert.equal(result.inventoryConfirmedLb, true)
  assert.equal(resolveBarbellSettings(defaults, { ...saved, inventoryConfirmedLb: false }, preference).inventoryConfirmedLb, false)
})
test('explicit saved pair counts support calculation; malformed or absent counts do not', () => {
  const counts = { '45': 2, '25': 1, '10': 2, '5': 1, '2.5': 1 }
  const withCounts = structuredClone(preference); withCounts.preferences.barbell.pairs = counts
  const result = resolveBarbellSettings(defaults, null, withCounts)
  assert.equal(result.inventoryConfirmedLb, true)
  for (const [plate, count] of Object.entries(counts)) assert.equal(result.pairsLb[plate], count)
  withCounts.preferences.barbell.pairs['10'] = 2.5
  assert.equal(resolveBarbellSettings(defaults, null, withCounts).inventoryConfirmedLb, false)
})
test('old auto-saved default inventory is ignored; older changed counts remain an unconfirmed draft', () => {
  const oldDefaults = resolveBarbellSettings(defaults, structuredClone(defaults), preference)
  assert.equal(oldDefaults.inventoryConfirmedLb, false)
  assert.ok(Object.values(oldDefaults.pairsLb).every(count => count === 0))
  const oldChanged = resolveBarbellSettings(defaults, { pairsLb: { ...defaults.pairsLb, '45': 2 } }, preference)
  assert.equal(oldChanged.pairsLb['45'], 2)
  assert.equal(oldChanged.inventoryConfirmedLb, false)
})
test('kg preferences never reinterpret lb plate sizes; missing profile retains utility fallback', () => {
  const kg = { weight_unit: 'kg', preferences: { barbell: { barWeight: 15, plates: [20, 10, 5, 2.5] } } }
  const result = resolveBarbellSettings(defaults, null, kg)
  assert.equal(result.unit, 'kg'); assert.equal(result.barKg, 15)
  assert.deepEqual(result.knownPlatesKg, [20, 10, 5, 2.5]); assert.equal(result.inventoryConfirmedKg, false)
  assert.deepEqual(result.pairsLb, defaults.pairsLb)
  assert.deepEqual(resolveBarbellSettings(defaults, null, null), defaults)
  assert.deepEqual(preference.preferences.barbell.plates, [45, 25, 10, 5, 2.5])
})
