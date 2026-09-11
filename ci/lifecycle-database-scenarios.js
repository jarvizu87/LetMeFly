/* QA driver, loaded ONLY into a disposable loopback service page. All domain writes
 * go through the unmodified production services, not a replacement data model. */
(() => {
  'use strict'
  if (location.hostname !== '127.0.0.1' || !location.search.includes('disposable-qa=1')) throw new Error('Disposable QA origin required')
  const Q = window.__LMF_LIFECYCLE_QA__
  const I = window.LetMeFlyExerciseIntelligence
  const assert = (ok, label) => { if (!ok) throw new Error(`INVARIANT: ${label}`) }
  const equal = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a).slice(0,180)} != ${JSON.stringify(b).slice(0,180)}`)
  const specs = [['crownforge', Q.programs.CROWNFORGE], ['crown-maintenance', Q.programs.CROWN_MAINTENANCE], ['black-crown', Q.programs.BLACK_CROWN]]
  const positions = specs.flatMap(([program, definition]) => definition.weekData.flatMap(week => week.days.map(day => ({ program, week: week.week, day: day.day, definition: day }))))
  const key = p => `${p.program}:W${p.week}:D${p.day}`
  const exs = p => p.definition.sections.flatMap(section => section.exercises.map(exercise => ({ section, exercise })))
  async function hash(value) {
    const data = new TextEncoder().encode(JSON.stringify(value))
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2,'0')).join('')
  }
  async function athlete() {
    const a = await Q.athlete.getActiveAthlete()
    assert(a && /^Disposable LMF53 /.test(a.display_name), 'Real/non-QA athlete must never be used')
    return a
  }
  async function counts() {
    const db = await Q.db.openLetMeFlyDb()
    try {
      const names = ['athletes','programInstances','programEvents','readinessEntries','workoutSessions','workoutExercises','workoutSets','syncOutbox']
      const tx = db.transaction(names, 'readonly')
      const values = await Promise.all(names.map(name => Q.db.requestToPromise(tx.objectStore(name).count())))
      return Object.fromEntries(names.map((name,i) => [name,values[i]]))
    } finally { db.close() }
  }
  async function bundle(index) {
    const a = await athlete(), p = positions[index]
    const b = await Q.workout.findWorkoutForDay(a.id,p.program,p.week,p.day)
    assert(b, `Missing persisted session ${key(p)}`)
    return b
  }
  const metric = source => {
    const first = value => { const match = String(value ?? '').match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null }
    if (source.distance) return { kind:'distance', value:first(source.distance), unit:/\b(?:ft|feet)\b/i.test(source.distance)?'ft':'m' }
    if (source.duration) return { kind:'duration', value:first(source.duration), unit:/\bmin/i.test(source.duration)?'min':'sec' }
    return { kind:null, value:null, unit:null, reps:typeof source.reps === 'number'?source.reps:first(source.reps) }
  }
  function orderedSets(b) {
    const groups = new Map()
    for (const item of b.exercises) {
      const g = groups.get(item.record.group_key) || []
      g.push(item); groups.set(item.record.group_key,g)
    }
    const rows = []
    for (const items of groups.values()) {
      if (items.some(item => item.record.group_type === 'round')) {
        for (let i=0;i<Math.max(...items.map(item=>item.sets.length));i++) for (const item of items) if (item.sets[i]) rows.push({item,set:item.sets[i],source:item.record.prescription_snapshot.sourceSets[i]})
      } else for (const item of items) item.sets.forEach((set,i)=>rows.push({item,set,source:item.record.prescription_snapshot.sourceSets[i]}))
    }
    return rows
  }
  async function snapshot() {
    const a = await athlete()
    const names = [...Q.db.DOMAIN_STORES,'syncOutbox']
    const db = await Q.db.openLetMeFlyDb()
    try {
      const tx = db.transaction(names, 'readonly')
      const rows = await Promise.all(names.map(name => Q.db.requestToPromise(tx.objectStore(name).getAll())))
      const data = Object.fromEntries(names.map((name,i) => [name, rows[i]]))
      const sessions = data.workoutSessions.filter(x=>!x.deleted_at)
      const exercises = data.workoutExercises.filter(x=>!x.deleted_at)
      const sets = data.workoutSets.filter(x=>!x.deleted_at)
      assert(data.athletes.length===1 && data.athletes[0].id===a.id, 'One isolated athlete per database')
      const sessionMap = new Map(sessions.map(s=>[s.id,s]))
      const exerciseMap = new Map(exercises.map(e=>[e.id,e]))
      const slotKeys = sessions.map(s=>`${s.program_key}:${s.week_number}:${s.day_key}`)
      assert(new Set(slotKeys).size===slotKeys.length, 'Duplicate sessions for governed position')
      const setKeys = sets.map(s=>`${s.workout_exercise_id}:${s.set_number}`)
      assert(new Set(setKeys).size===setKeys.length, 'Duplicate set number in exercise')
      for(const e of exercises) assert(sessionMap.has(e.workout_session_id) && e.athlete_id===a.id,'Orphan/cross-athlete exercise')
      for(const s of sets) {
        const e = exerciseMap.get(s.workout_exercise_id)
        assert(e && e.workout_session_id===s.workout_session_id && sessionMap.has(s.workout_session_id) && s.athlete_id===a.id,'Orphan/cross-session/cross-athlete set')
      }
      // Every dirty current record must have a matching committed outbox version.
      const outbox = new Map(data.syncOutbox.map(op=>[`${op.entityType}:${op.entityId}:${op.localVersion}`,op]))
      for(const name of Q.db.DOMAIN_STORES) for(const row of data[name]) if(row._local?.dirty) {
        const op=outbox.get(`${name}:${row.id}:${row._local.localVersion}`)
        assert(op,`Missing outbox partner for ${name}/${row.id}`)
        assert(op.athleteId===a.id, 'Cross-athlete outbox partner')
        equal(op.payload,Q.mutations.stripLocalMetadata(row),`Outbox payload drift ${name}/${row.id}`)
      }
      const history=await Q.workout.recentWorkoutSessions(a.id,sessions.length+10)
      equal([...history.map(s=>s.id)].sort(), [...sessions.map(s=>s.id)].sort(), 'Workout history/session identity parity')
      return { hash:await hash(data),counts:await counts(), completedSessions:sessions.filter(s=>s.status==='completed').length,completedSets:sets.filter(s=>s.completed).length,
        programInstances:data.programInstances.map(p=>({program:p.program_key,status:p.status,week:p.current_week,day:p.current_day_key})),
        eventTypes:data.programEvents.reduce((all,e)=>(all[e.event_type]=(all[e.event_type]||0)+1,all),{}) }
    } finally {db.close()}
  }
  async function inventory() {
    const list=positions.map(p=>({ program:p.program,week:p.week,day:p.day,restDay:Boolean(p.definition.restDay),exercises:exs(p).length,sets:exs(p).reduce((n,{exercise})=>n+exercise.sets.length,0),
      metricSets:exs(p).reduce((n,{exercise})=>n+exercise.sets.filter(s=>metric(s).kind).length,0),percentageSets:exs(p).reduce((n,{exercise})=>n+exercise.sets.filter(s=>s.percentage!=null).length,0)}))
    const uses=[]
    for(let index=0;index<positions.length;index++) for(const {exercise} of exs(positions[index])) {
      const primary=I.getExercise(exercise.id) || I.getExercise(exercise.name)
      for(const rule of I.getSubstitutions(primary?.id,{includeBlocked:true})) {
        if(!rule.alternativeInCurrentApp || String(rule.promotionStatus).startsWith('DO NOT') || /^no(?:\s|$)/i.test(String(rule.rolePreserved))) continue
        if(!I.getExercise(rule.alternativeExerciseId)) continue
        uses.push({index,exerciseId:exercise.id,ruleId:rule.id,primary:primary.id,alternative:rule.alternativeExerciseId})
      }
    }
    const groups=new Map()
    for(const use of uses){const group=groups.get(use.ruleId)||[];group.push(use);groups.set(use.ruleId,group)}
    const selected=[...groups.values()].filter(group=>new Set(group.map(x=>x.index)).size>=4).sort((a,b)=>b.length-a.length)[0]
    const distinct=selected?[...new Map(selected.map(x=>[x.index,x])).values()].slice(0,4):[]
    return {positions:list,programHash:await hash(specs),substitutionPlan:distinct.map((x,i)=>({...x,apply:i<3})),ruleCount:I.getAllSubstitutionRules().length}
  }
  async function bootstrap(mode) {
    assert((await Q.db.getAll('athletes')).length===0,'Profile must start empty')
    const a=await Q.athlete.createLocalAthlete({displayName:`Disposable LMF53 ${mode}`,weightUnit:'lb'})
    await Q.athlete.setTrainingMax(a.id,'clean',135,'lb')
    return {athleteId:a.id,position:Q.progression.positionFromProgramInstance(await Q.athlete.getCurrentProgramInstance(a.id)),counts:await counts()}
  }
  async function begin({index,mode}) {
    const a=await athlete(), p=positions[index]
    const current=await Q.athlete.getCurrentProgramInstance(a.id)
    equal(Q.progression.positionFromProgramInstance(current),{program:p.program,week:p.week,day:p.day},`Current position before start ${key(p)}`)
    const readiness=await Q.readiness.saveReadiness(a.id,{sleepQuality:4,soreness:2,stress:2,energy:mode==='variable'?3:4,sleepHours:7,notes:'Disposable QA readiness'})
    const b=await Q.workout.startWorkout(a.id,current.id,p.program,p.week,p.definition,readiness.id)
    const before=await counts()
    const resumed=await Q.workout.startWorkout(a.id,current.id,p.program,p.week,p.definition,readiness.id)
    equal(resumed.session.id,b.session.id,'Sequential start is idempotent')
    equal(await counts(),before,'Sequential start creates no duplicate skeleton/outbox')
    const sources=exs(p)
    assert(b.exercises.length===sources.length,`Exercise count ${key(p)}`)
    let percentages=0,unresolvedPercentages=0,metrics=0,roundSets=0
    const tms=await Q.athlete.getLatestTrainingMaxes(a.id)
    for(let i=0;i<sources.length;i++) {
      const {exercise,section}=sources[i], item=b.exercises[i]
      equal(item.record.exercise_key,exercise.id,`Non-sticky original exercise ${key(p)}`)
      equal(item.record.substituted_from_exercise_key,null,'New occurrence must not retain prior substitution')
      equal(item.record.prescription_snapshot.sourceSets,exercise.sets,'Immutable source prescription snapshot')
      equal(item.record.group_key,section.id,'Source group is preserved')
      assert(item.sets.length===exercise.sets.length,'Set count preserved')
      for(let j=0;j<item.sets.length;j++) {
        const set=item.sets[j],source=exercise.sets[j],perf=set.performance_data
        equal(perf.programmedReps,source.reps??null,'Reps prescription preserved')
        equal(perf.duration,source.duration??null,'Duration prescription preserved')
        equal(perf.distance,source.distance??null,'Distance prescription preserved')
        equal(perf.percentage,source.percentage??null,'Percentage prescription preserved')
        equal(perf.programmedLoadValue,source.loadValue??null,'Direct load prescription preserved')
        if(metric(source).kind)metrics++
        if(item.record.group_type==='round')roundSets++
        if(typeof source.percentage==='number' && source.loadReference?.startsWith('black-crown:tm:') && source.loadValue==null) {
          const ref=source.loadReference.slice('black-crown:tm:'.length), tm=tms[ref==='power-clean'?'clean':ref]
          if(tm){const raw=tm.tm_value*(source.percentage>1?source.percentage/100:source.percentage);const rounding=source.rounding==='nearest-5'?Math.round:source.rounding==='down-5'?Math.floor:Math.ceil; equal(set.load_value,rounding(raw/5)*5,'Private TM percentage loading');percentages++}
          else {equal(set.load_value,null,'Missing TM never fabricates load');unresolvedPercentages++}
        }
      }
    }
    return {sessionId:b.session.id,sets:orderedSets(b).length,exercises:b.exercises.length,percentages,unresolvedPercentages,metrics,roundSets,counts:before}
  }
  async function log({index,mode,from=0,to=null}) {
    const a=await athlete(),b=await bundle(index),rows=orderedSets(b)
    const end=to==null?rows.length:to
    let saved=0,metricLogs=0
    for(let j=from;j<end;j++) {
      const {item,set,source}=rows[j]
      const m=metric(source)
      const values={reps:m.kind?null:(m.reps??(/amrap/i.test(String(source.reps))?8:null)),rpe:mode==='variable'?6.5+(j%4)*0.5:7,rir:mode==='variable'?j%3:2,notes:`Disposable QA ${index}/${j}`}
      if(typeof set.load_value==='number') {values.loadValue=mode==='variable'?Math.max(0,set.load_value+(j%5===0?2.5:0)):set.load_value;values.loadUnit=set.load_unit}
      if(m.kind){values.metricKind=m.kind;values.metricValue=m.value??1;values.metricUnit=m.unit;metricLogs++}
      const logged=await Q.workout.logSet(a.id,set.id,values)
      const reloaded=await Q.db.getById('workoutSets',set.id)
      assert(reloaded.completed===true && reloaded.completed_at,'Set really committed')
      equal(reloaded,logged,'Log return equals actual IndexedDB record')
      equal(reloaded.performance_data.programmedReps,source.reps??null,'Logging cannot rewrite prescription')
      if(m.kind){equal(reloaded.performance_data.actualMetricValue,values.metricValue,'Persisted measured metric');equal(reloaded.performance_data.actualMetricUnit,m.unit,'Persisted measured metric unit')}
      if(typeof values.loadValue==='number')equal(reloaded.load_value,values.loadValue,'Actual working load committed')
      if(mode==='variable' && j===0) {
        await Q.workout.uncompleteSet(a.id,set.id)
        const reopened=await Q.db.getById('workoutSets',set.id)
        assert(!reopened.completed,'Set reopens for correction')
        await Q.workout.logSet(a.id,set.id,{...values,rpe:7.5})
      }
      saved++
    }
    return {saved,metricLogs}
  }
  async function substitute({index,exerciseId,ruleId,apply}) {
    const a=await athlete(),b=await bundle(index)
    const item=b.exercises.find(x=>x.record.exercise_key===exerciseId)
    assert(item,'Programmed substitution occurrence exists')
    if(!apply){assert(!item.record.substituted_from_exercise_key,'Later occurrence returned to source movement');return {returnedToProgram:true}}
    const primary=I.getExercise(exerciseId)||I.getExercise(item.record.exercise_name_snapshot)
    const rule=I.getSubstitutions(primary.id,{includeBlocked:true}).find(x=>x.id===ruleId)
    assert(rule?.alternativeInCurrentApp && !String(rule.promotionStatus).startsWith('DO NOT'),'Only real governed role-preserving rule')
    const alternative=I.getExercise(rule.alternativeExerciseId)
    const equipment=Array.isArray(alternative.equipment)?alternative.equipment:[]
    await Q.athlete.updateSubstitutionEquipmentProfile(a.id,alternative.id,equipment,'available')
    const transfer=rule.loadTransfer
    const strategy=transfer?.strategy??'rpe-guided'
    const mode=strategy==='same-load'?'same':strategy==='percentage-adjustment'?'factor':strategy==='no-load-transfer'?'none':'manual'
    const input={alternativeExerciseKey:alternative.id,alternativeExerciseName:alternative.canonicalName,ruleId:rule.id,loadingAdjustment:rule.loadingAdjustment,loadMode:mode,loadFactor:transfer.factor??null,loadStrategy:strategy,manualLoadValue:null,reason:'equipment-unavailable',reasonDetail:'Disposable QA setup; not medical advice'}
    const prior=await Q.workout.previousExercisePerformance(a.id,alternative.id,b.session.id)
    const original=item.sets.map(x=>({load:x.load_value,unit:x.load_unit,source:x.performance_data.programmedReps}))
    await Q.workout.substituteWorkoutExercise(a.id,item.record.id,input)
    await Q.workout.revertWorkoutExerciseSubstitution(a.id,item.record.id)
    const reverted=(await bundle(index)).exercises.find(x=>x.record.id===item.record.id)
    equal(reverted.sets.map(x=>({load:x.load_value,unit:x.load_unit,source:x.performance_data.programmedReps})),original,'Exact pre-performance Undo across repeated occurrences')
    await Q.workout.substituteWorkoutExercise(a.id,item.record.id,input)
    const performed=(await bundle(index)).exercises.find(x=>x.record.id===item.record.id)
    equal(performed.record.exercise_key,alternative.id,'Performed exercise key persisted')
    equal(performed.record.substituted_from_exercise_key,exerciseId,'Original source ID retained')
    equal(performed.record.prescription_snapshot.sourceSets,item.record.prescription_snapshot.sourceSets,'Substitution dose remains program-owned')
    return {exerciseRecordId:item.record.id,alternative:alternative.id,priorSessionId:prior?.sessionId??null,ruleId:rule.id}
  }
  async function assertLocked({index,exerciseRecordId}) {
    const a=await athlete(),b=await bundle(index),item=b.exercises.find(x=>x.record.id===exerciseRecordId)
    const set=item.sets[0]
    assert(set.completed,'Substitute work logged')
    await Q.workout.uncompleteSet(a.id,set.id)
    let rejected=false
    try{await Q.workout.revertWorkoutExerciseSubstitution(a.id,item.record.id)}catch(error){rejected=/locked|relabeled/i.test(error.message)}
    assert(rejected,'Logged substitute identity must stay locked after reopening')
    const reloaded=(await bundle(index)).exercises.find(x=>x.record.id===exerciseRecordId)
    equal(reloaded.record.exercise_key,item.record.exercise_key,'Reopen cannot relabel history')
    assert(reloaded.sets[0].performance_data.substitutionPerformanceLoggedAt,'Logged provenance marker retained')
    await Q.workout.logSet(a.id,set.id,{reps:set.reps,loadValue:set.load_value,loadUnit:set.load_unit,rpe:set.rpe,rir:set.rir})
    return {locked:true}
  }
  async function finish({index}) {
    const a=await athlete(),b=await bundle(index),p=positions[index]
    assert(orderedSets(b).every(x=>x.set.completed),'Every scheduled QA set is committed before completing')
    await Q.workout.completeWorkout(a.id,b.session.id)
    const done=await Q.db.getById('workoutSessions',b.session.id)
    assert(done.status==='completed' && done.completed_at,'Session completion persisted')
    return {sessionId:done.id}
  }
  async function advance({index}) {
    const a=await athlete(),p=positions[index]
    const result=await Q.progression.advanceProgramAfterWorkout(a.id,p.program,p.week,p.day)
    if(result.action==='entry-gate') {
      const lifts=Object.fromEntries([['front-squat',207],['back-squat',271],['bench-press',243],['deadlift',319]].map(([name,value])=>[name,{verified1RmLb:value,readiness:'green'}]))
      const red={lifts:{...lifts,'deadlift':{verified1RmLb:319,readiness:'red'}},optionalOHP:{verified1RmLb:153,readiness:'green'}}
      assert((await Q.progression.activateBlackCrownFromEntry(a.id,red)).action==='blocked','Red main-lift entry must delay activation')
      const allowed={lifts:{...lifts,'bench-press':{verified1RmLb:243,readiness:'yellow'}},optionalOHP:{verified1RmLb:153,readiness:'green'}}
      const active=await Q.progression.activateBlackCrownFromEntry(a.id,allowed)
      assert(active.action==='black-crown-started','Governed entry activation persisted')
      equal(active.approvedTms['bench-press'],Math.round(243*.875/5)*5,'Yellow entry TM factor')
      equal(active.approvedTms['front-squat'],Math.round(207*.9/5)*5,'Green entry TM factor')
    }
    const current=await Q.athlete.getCurrentProgramInstance(a.id), next=positions[index+1]
    equal(Q.progression.positionFromProgramInstance(current),next?{program:next.program,week:next.week,day:next.day}:null,'Actual next program position')
    // Repeating old advancement may reject, but it must never mutate position/events.
    const before=await counts();let duplicateRejected=false
    try{await Q.progression.advanceProgramAfterWorkout(a.id,p.program,p.week,p.day)}catch{duplicateRejected=true}
    assert(duplicateRejected,'Stale progression request rejected')
    equal(await counts(),before,'Stale completion never advances twice')
    return {action:result.action,position:Q.progression.positionFromProgramInstance(current)}
  }
  async function previous({exerciseKey,expectedSession}) {
    const a=await athlete(),h=await Q.workout.previousExercisePerformance(a.id,exerciseKey,null)
    assert(h && h.sessionId===expectedSession,'Actual previous-performed-exercise history points to substitute session')
    assert(h.sets.length>0,'Substitute history has completed sets')
    return h
  }
  async function adversarial() {
    const a=await athlete(),p=positions[0],instance=await Q.athlete.getCurrentProgramInstance(a.id)
    const ready=await Q.readiness.saveReadiness(a.id,{sleepQuality:4,soreness:2,stress:2,energy:4})
    // The real public service is deliberately called twice while both lookups can
    // be in flight, as with two open tabs. No storage methods are mocked.
    const results=await Promise.allSettled([0,1].map(()=>Q.workout.startWorkout(a.id,instance.id,p.program,p.week,p.definition,ready.id)))
    const sessions=await Q.db.getAll('workoutSessions')
    const findings=[]
    if(sessions.length!==1)findings.push({type:'concurrent-start-duplicate-session',expected:1,actual:sessions.length,returned:results.map(x=>x.status==='fulfilled'?x.value.session.id:x.reason.message),sessions:sessions.map(x=>({id:x.id,program:x.program_key,week:x.week_number,day:x.day_key}))})
    return {findings,counts:await counts()}
  }
  window.__LMF53TEST__=Object.freeze({inventory,bootstrap,begin,log,substitute,assertLocked,finish,advance,previous,snapshot,counts,adversarial})
})()
