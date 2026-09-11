import test from 'node:test'
import assert from 'node:assert/strict'
import { assetRecord, scopedMap, parseArtImport } from '../overlays/ui-command-v2/batch-n/exercise-art-contract.mjs'
const asset = { publicId: 'qa/squat/v2', format: 'webp', status: 'approved' }
const payload = { format: 'letmefly-private-exercise-art-map', formatVersion: 2, athleteId: 'qa-a', overrides: { squat: asset } }
test('explicit approval and safe image paths are required', () => {
  assert.ok(assetRecord(asset))
  for (const patch of [{status:undefined},{status:'candidate'},{publicId:'qa/../b'},{publicId:'//example/a'},{publicId:'qa/a?x=y'},{publicId:'qa/a"'},{format:'svg'},{format:'webp?x=1'}]) assert.equal(assetRecord({...asset,...patch}),null)
})
test('scoped maps never fall back to global or another athlete', () => {
  assert.deepEqual({...scopedMap(payload,'qa-a')},{squat:asset})
  for (const [value,id] of [[payload,'qa-b'],[payload,null],[payload.overrides,'qa-a'],[{...payload,formatVersion:1},'qa-a']]) assert.deepEqual({...scopedMap(value,id)},{})
})
test('import rejects foreign identity and incomplete approvals without mutating input', () => {
  const before = JSON.stringify(payload)
  assert.equal(JSON.stringify(parseArtImport(payload,'qa-a')),JSON.stringify(payload))
  assert.throws(()=>parseArtImport(payload,'qa-b'),/different athlete/)
  assert.throws(()=>parseArtImport({...payload,athleteId:null},'qa-a'),/identity/)
  assert.throws(()=>parseArtImport({...payload,overrides:{squat:{...asset,status:'candidate'}}},'qa-a'),/explicit approved/)
  assert.equal(JSON.stringify(payload),before)
})
test('legacy maps bind only through the reviewed import path', () => {
  const legacy={...payload,formatVersion:1};delete legacy.athleteId
  assert.deepEqual({...scopedMap(legacy,'qa-a')},{})
  assert.equal(parseArtImport(legacy,'qa-a').athleteId,'qa-a')
  assert.throws(()=>parseArtImport(legacy,null),/select your athlete/)
})
