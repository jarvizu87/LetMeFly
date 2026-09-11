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

import { privateDelivery, approvedPrivateRows } from '../overlays/ui-command-v2/batch-n/exercise-art-contract.mjs'
import { createPrivateArtBridge } from '../overlays/ui-command-v2/batch-n/exercise-art-native.mjs'
const athleteId = '00000000-0000-4000-8000-000000000001', otherId = '00000000-0000-4000-8000-000000000002'
const rowId = '10000000-0000-4000-8000-000000000001', imagePath = `${athleteId}/${'a'.repeat(64)}.webp`
const delivery = { kind:'supabase-private', bucket:'athlete-exercise-art', parts:[{path:imagePath,label:'Front squat'}] }
const cloudRow = { id:rowId,athlete_id:athleteId,exercise_key:'front-squat',status:'approved',is_active:true,deleted_at:null,metadata:{delivery} }
test('private records require athlete-owned content-addressed paths and complete distinct components',()=>{
  assert.deepEqual(privateDelivery(delivery,athleteId),delivery)
  for(const value of [ {...delivery,bucket:'public'}, {...delivery,parts:[]}, {...delivery,parts:[...delivery.parts,...delivery.parts]}, {...delivery,parts:[{path:`${otherId}/${'a'.repeat(64)}.webp`,label:'Foreign'}]}, {...delivery,parts:[{path:imagePath+'?token=secret',label:'Query'}]}, {...delivery,parts:[{path:imagePath,label:''}]}]) assert.equal(privateDelivery(value,athleteId),null)
  const png={...delivery,parts:[{path:imagePath.replace('.webp','.png'),label:'PNG'}]}
  assert.ok(privateDelivery(png,athleteId))
  assert.deepEqual({...approvedPrivateRows([cloudRow,{...cloudRow,athlete_id:otherId}],athleteId)},{'front-squat':{id:rowId,delivery}})
  assert.deepEqual({...approvedPrivateRows([cloudRow,{...cloudRow,id:otherId}],athleteId)},{})
  assert.deepEqual({...approvedPrivateRows([{...cloudRow,status:'review'},{...cloudRow,metadata:{}}],athleteId)},{})
})
function fixture() {
  const state={athleteId,session:{user:{id:'owner'}},user:{id:'owner'},owned:true,rows:[cloudRow],downloads:[],bytes:new Blob(['art'],{type:'image/webp'})}
  const client={from(table){const filters=[];const query={select(){return query},eq(key,value){filters.push([key,value]);return query},is(){return query},then(resolve,reject){const data=table==='athletes'?(state.owned?[{id:athleteId}]:[]):state.rows.filter(row=>filters.every(([key,value])=>row[key]===value));return Promise.resolve({data,error:null}).then(resolve,reject)}};return query},storage:{from(bucket){return{async download(path){state.downloads.push({bucket,path});if(state.onDownload)await state.onDownload();return{data:state.bytes,error:null}}}}}}
  const result=createPrivateArtBridge({activeAthlete:async()=>({id:state.athleteId}),auth:{getLocalSession:async()=>state.session,getTrustedCurrentUser:async()=>state.user},client,configured:()=>true})
  return{state,...result}
}
test('native bridge downloads only an issued, currently approved exact reference',async()=>{
  const {state,bridge}=fixture()
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
  assert.equal((await bridge.readCloud(athleteId)).length,1)
  for(const args of [[otherId,'front-squat',rowId,imagePath],[athleteId,'squat',rowId,imagePath],[athleteId,'front-squat',otherId,imagePath],[athleteId,'front-squat',rowId,imagePath.replace('aaaa','bbbb')]])assert.equal(await bridge.readAsset(...args),null)
  assert.equal(state.downloads.length,0)
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),state.bytes)
  state.rows=[{...cloudRow,status:'review'}]
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
  state.rows=[cloudRow,{...cloudRow,id:otherId}]
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
  assert.equal(state.downloads.length,1)
})
test('missing session, untrusted identity, ownership loss and logout cannot deliver bytes',async()=>{
  for(const patch of [{session:null},{user:{id:'other'}},{owned:false},{athleteId:otherId}]){
    const {state,bridge}=fixture();Object.assign(state,patch)
    assert.deepEqual(await bridge.readCloud(athleteId),[])
    assert.equal(state.downloads.length,0)
  }
  const {state,bridge,invalidate}=fixture();await bridge.readCloud(athleteId)
  state.onDownload=async()=>{state.session=null;invalidate()}
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
})
test('image MIME is verified against its content-addressed extension',async()=>{
  const {state,bridge}=fixture();await bridge.readCloud(athleteId)
  state.bytes=new Blob(['script'],{type:'image/svg+xml'})
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
  state.bytes=new Blob([],{type:'image/webp'})
  assert.equal(await bridge.readAsset(athleteId,'front-squat',rowId,imagePath),null)
})
