import test from 'node:test'
import assert from 'node:assert/strict'
import {recapSession, previousComparable, mountainGeometry, LB_TO_KG} from '../overlays/workout-recap-v1/workout-recap.mjs'
const aid='disposable-athlete', start='2026-09-10T10:00:00Z', finish='2026-09-10T11:00:00Z'
function fixture(sessionId='current', started_at=start, completed_at=finish) {
  const exerciseId=sessionId+'-exercise'
  return {sessions:[{id:sessionId,athlete_id:aid,status:'completed',started_at,completed_at,program_key:'crownforge',program_version:'v2.2',phase_key:'build',day_key:'day-1',week_number:2,workout_name:'Strength'}],
    exercises:[{id:exerciseId,athlete_id:aid,workout_session_id:sessionId,exercise_key:'bench',exercise_name_snapshot:'Bench',group_key:'strength',group_type:'section',order_index:0,prescription_snapshot:{priority:'mandatory',sourceSets:[{label:'1',reps:5},{label:'2',reps:5}]}}],
    sets:[1,2].map(n=>({id:sessionId+'-set-'+n,athlete_id:aid,workout_session_id:sessionId,workout_exercise_id:exerciseId,set_number:n,completed:true,completed_at,load_value:100,load_unit:'lb',reps:5,performance_data:{actualMetricKind:'reps'}}))}
}
const recap=(s,extra={})=>recapSession(s,{athleteId:aid,sessionId:'current',...extra})
test('only saved completed actuals; identical duplicate IDs counted once',()=>{
  const s=fixture();s.sets.push(structuredClone(s.sets[0]));s.sets[1].completed=false
  const r=recap(s);assert.equal(r.counts.completed,1);assert.equal(r.volume,500);assert.equal(r.counts.unlogged,1);assert.equal(r.elapsedSeconds,3600)
})
test('mixed units normalize to selected native unit and correct tonnage',()=>{
  const s=fixture();s.sets[0].load_unit='kg';s.sets[0].load_value=100*LB_TO_KG
  assert.equal(recap(s).volume,1000);assert.equal(recap(s).tonnage,.5)
  const kg=recap(s,{unit:'kg'});assert.equal(kg.volume,1000*LB_TO_KG);assert.equal(kg.tonnage,LB_TO_KG);assert.equal(kg.tonnageUnit,'metric tonnes')
})
test('no invented bodyweight, blank/invalid load, per-hand or per-side multiplier',()=>{
  const s=fixture();s.exercises[0].exercise_name_snapshot='DB curl per hand';s.sets[0].reps=5;s.sets[1].load_value=null
  const r=recap(s);assert.equal(r.volume,500);assert.equal(r.counts.completed,2);assert.match(r.warnings.join(' '),/no usable load/)
  s.sets[0].load_value=-1;assert.equal(recap(s).volume,null)
  s.sets[0].load_value=0;assert.equal(recap(s).volume,0)
})
test('time/distance actuals stay separate even with numeric reps and heavy load',()=>{
  const s=fixture();s.sets[0].performance_data={actualMetricKind:'distance',actualMetricValue:20,actualMetricUnit:'yd'}
  s.sets[1].performance_data={actualMetricKind:'duration',actualMetricValue:2,actualMetricUnit:'hr'}
  const r=recap(s);assert.equal(r.volume,null);assert.equal(r.exercises[0].distanceM,18.288);assert.equal(r.exercises[0].durationSeconds,7200)
})
test('a metric prescription never becomes lifting volume from prefilled reps',()=>{
  const s=fixture();s.exercises[0].prescription_snapshot.sourceSets.forEach(row=>row.distance='20 m')
  assert.equal(recap(s).volume,null)
})
test('invalid joins, duplicate slots, conflicting IDs and substitution relabels excluded',()=>{
  const s=fixture();s.sets.push({...s.sets[0],id:'duplicate-slot'});assert.equal(recap(s).counts.completed,1)
  s.sets=fixture().sets;s.sets.push({...s.sets[0],reps:20});assert.equal(recap(s).volume,500)
  s.sets=fixture().sets;s.sets[0].performance_data.substitutionPerformedExerciseKey='squat';assert.equal(recap(s).volume,500)
  s.sets[1].workout_exercise_id='missing';assert.equal(recap(s).volume,null)
})
test('athlete isolation and deleted rows',()=>{
  const s=fixture();s.sets[0].athlete_id='other';s.sets[1].deleted_at=finish;assert.equal(recap(s).volume,null)
  assert.throws(()=>recapSession(s,{athleteId:'other',sessionId:'current'}),/unavailable/)
})
test('completion timestamps outside the saved session interval are excluded',()=>{
  const s=fixture();s.sets[0].completed_at='2026-09-09T11:00:00Z';s.sets[1].completed_at='2026-09-11T11:00:00Z'
  assert.equal(recap(s).volume,null);assert.equal(recap(s).counts.completed,0)
})
test('optional, skipped, unlogged and unknown saved skeleton totals are distinct',()=>{
  const s=fixture();s.sets[0].completed=false;s.sets[0].performance_data.skipped=true;s.sets[1].completed=false;s.exercises[0].prescription_snapshot.priority='optional'
  const r=recap(s);assert.equal(r.counts.skipped,1);assert.equal(r.counts.optionalUnlogged,1);assert.equal(r.counts.unlogged,0);assert.equal(r.counts.planned,2)
  s.sets.pop();assert.equal(recap(s).counts.planned,null)
})
test('saved context comparison requires matching program, phase, prescription and performed exercise',()=>{
  const s=fixture(), prior=fixture('prior','2026-09-01T10:00:00Z','2026-09-01T11:00:00Z');for(const key of ['sessions','exercises','sets'])s[key].push(...prior[key])
  assert.equal(previousComparable(s,recap(s)).sessionId,'prior')
  s.sessions[1].phase_key='deload';assert.equal(previousComparable(s,recap(s)),null);s.sessions[1].phase_key='build'
  s.exercises[1].exercise_key='machine-bench';assert.equal(previousComparable(s,recap(s)),null);s.exercises[1].exercise_key='bench'
  s.exercises[1].prescription_snapshot.sourceSets[0].reps=3;assert.equal(previousComparable(s,recap(s)),null)
})
test('matching unloaded/bodyweight slots do not erase a valid measured-volume comparison',()=>{
  const s=fixture(), prior=fixture('prior','2026-09-01T10:00:00Z','2026-09-01T11:00:00Z');s.sets[1].load_value=null;prior.sets[1].load_value=null
  for(const key of ['sessions','exercises','sets'])s[key].push(...prior[key])
  assert.equal(previousComparable(s,recap(s)).sessionId,'prior')
  s.sets[3].load_value=50;assert.equal(previousComparable(s,recap(s)),null,'Different measured set-slot coverage is held')
})
test('matching percentages with different saved TM/load context do not compare; actual load remains free to differ',()=>{
  const s=fixture(), prior=fixture('prior','2026-09-01T10:00:00Z','2026-09-01T11:00:00Z')
  const context={percentage:75,loadReference:'training-max',resolvedTrainingMaxKey:'bench',resolvedTrainingMaxValue:200,resolvedTrainingMaxUnit:'lb',resolvedLoadValue:150}
  for(const row of [...s.sets,...prior.sets])Object.assign(row.performance_data,context)
  for(const key of ['sessions','exercises','sets'])s[key].push(...prior[key])
  s.sets[2].load_value=50;assert.equal(previousComparable(s,recap(s)).sessionId,'prior','Actual performed load is the comparison measurement')
  s.sets[2].performance_data.resolvedTrainingMaxValue=225;assert.equal(previousComparable(s,recap(s)),null)
  s.sets[2].performance_data.resolvedTrainingMaxValue=200;s.sets[2].performance_data.substitutionLoadMode='manual';assert.equal(previousComparable(s,recap(s)),null)
})
test('saved recap independent of subsequent active program/position and elapsed excludes invented active time',()=>{
  const s=fixture(), before=recap(s);s.programs=[{program_key:'black-crown',current_week:8}];assert.deepEqual(recap(s),before)
  s.sessions[0].completed_at='invalid';assert.equal(recap(s).elapsedSeconds,null)
})
test('mountains use one linear zero-based height scale; zero is flat',()=>{
  const g=mountainGeometry(12000,6000);assert.equal(g.baseline-g.currentY,2*(g.baseline-g.previousY))
  assert.equal(mountainGeometry(0,0).currentY,208);assert.equal(mountainGeometry(null).currentY,null)
})
