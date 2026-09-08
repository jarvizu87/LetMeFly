(() => {
  'use strict'

  const ROOT_ID = 'lmf-progress-dashboard-v1'
  const DB_NAME = 'letmefly-private'
  const TAB_KEY = 'letmefly_progress_dashboard_tab_v1'
  const RANGE_KEY = 'letmefly_progress_dashboard_range_v1'
  const TOOLS_KEY = 'letmefly_progress_native_tools_open_v1'
  const MAXES_KEY = 'letmefly_private_strength_maxes_v1'
  const TABS = ['overview', 'strength', 'body', 'conditioning', 'prs']
  const RANGES = ['7d', '30d', 'all']
  const LIFT_META = [
    { id:'back-squat', name:'Back Squat', aliases:['back-squat','back squat'] },
    { id:'front-squat', name:'Front Squat', aliases:['front-squat','front squat'] },
    { id:'bench-press', name:'Bench Press', aliases:['bench-press','bench press','barbell bench press'] },
    { id:'deadlift', name:'Deadlift', aliases:['deadlift','conventional deadlift'] },
    { id:'overhead-press', name:'Overhead Press', aliases:['overhead-press','overhead press','ohp','strict press'] },
    { id:'power-clean', name:'Power Clean', aliases:['power-clean','power clean','clean'] },
    { id:'power-snatch', name:'Power Snatch', aliases:['power-snatch','power snatch','snatch'] },
  ]

  let activeTab = readSetting(TAB_KEY, 'overview', TABS)
  let range = readSetting(RANGE_KEY, '30d', RANGES)
  let timer = 0
  let scanQueued = false
  let generation = 0
  let vaultCache = { at:0, range:'', data:null }

  function readSetting(key, fallback, allowed) {
    try { const value = localStorage.getItem(key); return allowed.includes(value) ? value : fallback }
    catch (_) { return fallback }
  }
  function writeSetting(key, value) { try { localStorage.setItem(key, value) } catch (_) {} }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null }
  function asDate(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d }
  function day(value) { const d = asDate(value); return d ? d.toISOString().slice(0,10) : '' }
  function dateLabel(value) {
    const d = asDate(value); if (!d) return '—'
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'}).format(d) }
    catch (_) { return day(value) || '—' }
  }
  function rangeCutoff() {
    if (range === 'all') return null
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (range === '7d' ? 6 : 29)); return d
  }
  function inRange(value) { const c = rangeCutoff(); if (!c) return true; const d = asDate(value); return Boolean(d && d >= c) }
  function loadText(value, unit='lb') { const n = num(value); return n && n > 0 ? `${formatNumber(n)} ${unit || 'lb'}` : '—' }
  function formatNumber(value) { const n = num(value); if (n == null) return '—'; return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10) }
  function average(rows, key) { const values = rows.map(x => num(x?.[key])).filter(x => x != null); return values.length ? Math.round(values.reduce((a,b)=>a+b,0) / values.length * 10) / 10 : null }
  function nonDeleted(rows) { return rows.filter(x => x && !x.deleted_at) }
  function byNewest(rows, field) { return [...rows].sort((a,b)=>(asDate(b?.[field])?.getTime()||0)-(asDate(a?.[field])?.getTime()||0)) }

  function normalizeLiftKey(value) { return String(value || '').toLowerCase().replace(/[–—]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }
  function liftIdFor(value) {
    const clean = normalizeLiftKey(value)
    if (!clean) return null
    for (const meta of LIFT_META) if (meta.aliases.some(alias => clean === normalizeLiftKey(alias) || clean.includes(normalizeLiftKey(alias)))) return meta.id
    return null
  }
  function liftMeta(id) { return LIFT_META.find(x => x.id === id) || { id, name:String(id || '').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), aliases:[id] } }

  function strengthState() {
    try {
      if (window.__LMF_STRENGTH_MAXES__?.get) return window.__LMF_STRENGTH_MAXES__.get()
      const raw = localStorage.getItem(MAXES_KEY); return raw ? JSON.parse(raw) : null
    } catch (_) { return null }
  }
  function localStrengthRows() {
    const state = strengthState(); if (!state?.lifts) return []
    return Object.entries(state.lifts).map(([id,lift]) => ({id,...lift})).filter(x => x?.name)
  }
  function localMaxEvents() {
    const out=[]
    for (const lift of localStrengthRows()) for (const item of Array.isArray(lift.history) ? lift.history : []) {
      const date=item?.date || item?.createdAt; if (!item || !inRange(date)) continue
      out.push({id:item.id || `${lift.id}-${item.type}-${date}-${item.value}`,kind:'strength-local',liftId:lift.id,liftName:lift.name,type:item.type || 'max_update',value:item.value,unit:item.unit || lift.unit || 'lb',date,source:item.source || '',load:item.load,reps:item.reps,rpe:item.rpe})
    }
    return out
  }

  function idbRequest(request) { return new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error || new Error('IndexedDB request failed')) }) }
  function txDone(tx) { return new Promise((resolve,reject) => { tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error || new Error('IndexedDB transaction failed')); tx.onabort=()=>reject(tx.error || new Error('IndexedDB transaction aborted')) }) }
  async function openExistingDb() {
    if (!('indexedDB' in window)) return null
    try {
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases()
        if (!dbs.some(db => db.name === DB_NAME)) return null
      }
    } catch (_) {}
    return new Promise(resolve => {
      let req
      try { req = indexedDB.open(DB_NAME) } catch (_) { resolve(null); return }
      let upgrading=false
      req.onupgradeneeded=()=>{ upgrading=true; try { req.transaction.abort() } catch (_) {} }
      req.onerror=()=>resolve(null)
      req.onsuccess=()=>{ const db=req.result; if (upgrading || !db.objectStoreNames.contains('athletes')) { try { db.close() } catch (_) {}; resolve(null); return } resolve(db) }
    })
  }
  async function readStoreForAthlete(db, storeName, athleteId) {
    if (!db.objectStoreNames.contains(storeName)) return []
    const tx=db.transaction(storeName,'readonly'); const store=tx.objectStore(storeName); let rows
    try {
      if (athleteId && store.indexNames.contains('by-athlete')) rows=await idbRequest(store.index('by-athlete').getAll(athleteId))
      else rows=await idbRequest(store.getAll())
      await txDone(tx)
    } catch (_) { try { tx.abort() } catch (_) {}; return [] }
    return nonDeleted(Array.isArray(rows) ? rows : [])
  }
  async function chooseAthlete(db) {
    const rows=await readStoreForAthlete(db,'athletes',null)
    if (!rows.length) return null
    if (rows.length === 1) return rows[0]
    return [...rows].sort((a,b)=>(asDate(b.updated_at || b.created_at)?.getTime()||0)-(asDate(a.updated_at || a.created_at)?.getTime()||0))[0]
  }
  function latestTmMap(rows) {
    const map=new Map()
    for (const row of rows) {
      const key=normalizeLiftKey(row.exercise_key); if (!key) continue
      const prev=map.get(key)
      if (!prev || (asDate(row.effective_at)?.getTime()||0) > (asDate(prev.effective_at)?.getTime()||0)) map.set(key,row)
    }
    return map
  }
  function resolveTm(tmMap, liftId) {
    const aliases = liftId === 'power-clean' ? ['power-clean','clean'] : liftId === 'power-snatch' ? ['power-snatch','snatch'] : [liftId]
    for (const alias of aliases) { const row=tmMap.get(normalizeLiftKey(alias)); if (row) return row }
    return null
  }
  function e1rm(load,reps,unit) {
    const l=num(load),r=num(reps); if (!l || !r || r < 1 || r > 15) return null
    const raw=l*(1+r/30); const step=unit === 'kg' ? .5 : 1; return Math.round(raw/step)*step
  }
  function setDate(set, session) { return set.completed_at || session?.completed_at || session?.started_at || set.updated_at || set.created_at }
  function deriveE1rm(workoutExercises, workoutSets, sessions) {
    const sessionMap=new Map(sessions.map(x=>[x.id,x]))
    const exerciseMap=new Map(workoutExercises.map(x=>[x.id,x]))
    const perLift=new Map()
    for (const set of workoutSets) {
      if (!set.completed) continue
      const exercise=exerciseMap.get(set.workout_exercise_id); if (!exercise) continue
      const liftId=liftIdFor(exercise.exercise_key || exercise.exercise_name_snapshot); if (!liftId) continue
      const estimate=e1rm(set.load_value,set.reps,String(set.load_unit || 'lb').toLowerCase()); if (!estimate) continue
      const session=sessionMap.get(set.workout_session_id || exercise.workout_session_id)
      const date=setDate(set,session); if (!date || !inRange(date)) continue
      const point={value:estimate,unit:String(set.load_unit || 'lb').toLowerCase()==='kg'?'kg':'lb',date,load:num(set.load_value),reps:num(set.reps),rpe:num(set.rpe),sessionId:session?.id || null,workoutName:session?.workout_name || null}
      if (!perLift.has(liftId)) perLift.set(liftId,[])
      perLift.get(liftId).push(point)
    }
    for (const [liftId,points] of perLift) {
      points.sort((a,b)=>(asDate(a.date)?.getTime()||0)-(asDate(b.date)?.getTime()||0))
      const bestPerDay=new Map()
      for (const point of points) { const key=day(point.date); const prev=bestPerDay.get(key); if (!prev || point.value > prev.value) bestPerDay.set(key,point) }
      perLift.set(liftId,[...bestPerDay.values()].sort((a,b)=>(asDate(a.date)?.getTime()||0)-(asDate(b.date)?.getTime()||0)))
    }
    return perLift
  }
  function conditioningRows(exercises, sessions) {
    const sessionMap=new Map(sessions.map(x=>[x.id,x]))
    return exercises.map(exercise => {
      const session=sessionMap.get(exercise.workout_session_id)
      const name=String(exercise.exercise_name_snapshot || exercise.exercise_key || '')
      const category=String(exercise.prescription_snapshot?.category || '')
      const date=session?.completed_at || session?.started_at
      return {date,name,category,sessionId:session?.id}
    }).filter(x => x.date && inRange(x.date) && /sled|carry|farmer|suitcase|yoke|bike|rower|rowing|treadmill|conditioning|cardio|walk|run|assault|erg|gpp|work.?capacity/i.test(`${x.name} ${x.category}`))
  }
  function bodyRows(rows, athlete) {
    return rows.map(row => ({
      date:row.measured_at || row.recorded_at || row.created_at,
      value:num(row.value ?? row.bodyweight_value ?? row.weight_value ?? row.weight),
      unit:String(row.unit || row.bodyweight_unit || row.weight_unit || athlete?.default_weight_unit || 'lb').toLowerCase()==='kg'?'kg':'lb'
    })).filter(x => x.date && x.value && x.value > 50 && x.value < 700 && inRange(x.date)).sort((a,b)=>(asDate(a.date)?.getTime()||0)-(asDate(b.date)?.getTime()||0))
  }
  function prValue(record) {
    const p=record.performance && typeof record.performance === 'object' ? record.performance : {}
    const value=num(p.value ?? p.load ?? p.weight ?? p.e1rm ?? p.estimated1rm ?? p.estimated_1rm ?? record.value)
    const unit=String(p.unit || p.load_unit || p.weight_unit || record.unit || '').toLowerCase()
    return {value,unit:unit==='kg'?'kg':unit==='lb'?'lb':'',reps:num(p.reps),distance:p.distance ?? null,time:p.time ?? p.duration ?? null,raw:p}
  }
  function corePrEvents(records) {
    return records.filter(r => inRange(r.achieved_at || r.created_at)).map(record => {
      const p=prValue(record); const liftId=liftIdFor(record.exercise_key)
      let display=p.value ? `${formatNumber(p.value)}${p.unit ? ` ${p.unit}` : ''}` : ''
      if (p.reps) display += `${display ? ' × ' : ''}${formatNumber(p.reps)} reps`
      if (!display && p.distance != null) display=String(p.distance)
      if (!display && p.time != null) display=String(p.time)
      if (!display && Object.keys(p.raw).length) display='Recorded performance'
      return {id:`core-${record.id}`,kind:'core-pr',liftId,liftName:liftId?liftMeta(liftId).name:(record.exercise_key?String(record.exercise_key).replace(/-/g,' '):'Performance'),type:record.pr_type || 'PR',value:p.value,unit:p.unit,date:record.achieved_at || record.created_at,display,source:record.detected_by || ''}
    })
  }
  function derivedE1rmEvents(map) {
    const out=[]
    for (const [liftId,points] of map) {
      let best=0
      for (const point of points) if (point.value > best + .001) {
        best=point.value
        out.push({id:`derived-${liftId}-${day(point.date)}-${point.value}`,kind:'derived-e1rm',liftId,liftName:liftMeta(liftId).name,type:'estimated_1rm',value:point.value,unit:point.unit,date:point.date,load:point.load,reps:point.reps,rpe:point.rpe,source:'calculated from completed set'})
      }
    }
    return out
  }
  function dedupeEvents(events) {
    const seen=new Set()
    return events.filter(event => {
      const key=`${event.liftId || event.liftName}|${day(event.date)}|${String(event.type).toLowerCase()}|${event.value || event.display || ''}`
      if (seen.has(key)) return false
      seen.add(key); return true
    }).sort((a,b)=>(asDate(b.date)?.getTime()||0)-(asDate(a.date)?.getTime()||0))
  }

  async function readVault(force=false) {
    const now=Date.now()
    if (!force && vaultCache.data && vaultCache.range===range && now-vaultCache.at<2500) return vaultCache.data
    const empty={source:'fallback',athlete:null,program:null,tms:new Map(),sessions:[],completedSessions:[],workoutExercises:[],workoutSets:[],body:[],readiness:[],personalRecords:[],conditioning:[],e1rm:new Map(),events:[]}
    const db=await openExistingDb(); if (!db) { vaultCache={at:now,range,data:empty}; return empty }
    try {
      const athlete=await chooseAthlete(db); if (!athlete) { db.close(); vaultCache={at:now,range,data:empty}; return empty }
      const id=athlete.id
      const [tmRows,programRows,sessionRows,exerciseRows,setRows,bodyRaw,readinessRows,prRows]=await Promise.all([
        readStoreForAthlete(db,'trainingMaxHistory',id),readStoreForAthlete(db,'programInstances',id),readStoreForAthlete(db,'workoutSessions',id),readStoreForAthlete(db,'workoutExercises',id),readStoreForAthlete(db,'workoutSets',id),readStoreForAthlete(db,'bodyweightEntries',id),readStoreForAthlete(db,'readinessEntries',id),readStoreForAthlete(db,'personalRecords',id)
      ])
      const program=byNewest(programRows.filter(x=>x.status==='active'),'updated_at')[0] || byNewest(programRows,'started_on')[0] || null
      const sessions=byNewest(sessionRows,'started_at').filter(x=>inRange(x.completed_at || x.started_at || x.created_at))
      const completedSessions=sessions.filter(x=>x.status==='completed' || x.completed_at)
      const sessionIds=new Set(sessions.map(x=>x.id))
      const workoutExercises=exerciseRows.filter(x=>sessionIds.has(x.workout_session_id))
      const workoutExerciseIds=new Set(workoutExercises.map(x=>x.id))
      const workoutSets=setRows.filter(x=>sessionIds.has(x.workout_session_id) || workoutExerciseIds.has(x.workout_exercise_id))
      const body=bodyRows(bodyRaw,athlete)
      const readiness=readinessRows.filter(x=>inRange(x.recorded_at || x.created_at)).sort((a,b)=>(asDate(a.recorded_at||a.created_at)?.getTime()||0)-(asDate(b.recorded_at||b.created_at)?.getTime()||0))
      const e1rmMap=deriveE1rm(workoutExercises,workoutSets,sessions)
      const events=dedupeEvents([...localMaxEvents(),...corePrEvents(prRows),...derivedE1rmEvents(e1rmMap)])
      const data={source:'indexeddb',athlete,program,tms:latestTmMap(tmRows),sessions,completedSessions,workoutExercises,workoutSets,body,readiness,personalRecords:prRows,conditioning:conditioningRows(workoutExercises,sessions),e1rm:e1rmMap,events}
      vaultCache={at:now,range,data}; return data
    } catch (error) {
      console.warn('LetMeFly Progress dashboard could not read private vault',error)
      return empty
    } finally { try { db.close() } catch (_) {} }
  }

  function isVisible(el) { if (!el?.isConnected) return false; const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && el.getClientRects().length>0 }
  function progressHeading() { return [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent||'').trim()) && isVisible(el)) || null }
  function progressRoot(h) { return h?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || h?.parentElement || null }

  function mergedLifts(vault) {
    const locals=localStrengthRows(); const localMap=new Map(locals.map(x=>[x.id,x])); const ids=new Set([...LIFT_META.map(x=>x.id),...locals.map(x=>x.id)])
    return [...ids].map(id => {
      const local=localMap.get(id) || {id,name:liftMeta(id).name,unit:'lb',history:[]}
      const tm=resolveTm(vault.tms,id)
      const derived=vault.e1rm.get(id) || []
      const derivedBest=derived.reduce((best,p)=>!best||p.value>best.value?p:best,null)
      const localEstimate=num(local.estimated1rm)
      let estimate=localEstimate,estimateUnit=local.unit || 'lb',estimateDate=local.estimatedDate || null
      if (derivedBest && (!estimate || (derivedBest.unit===estimateUnit && derivedBest.value>estimate))) { estimate=derivedBest.value; estimateUnit=derivedBest.unit; estimateDate=derivedBest.date }
      return {...local,id,name:local.name || liftMeta(id).name,tmValue:num(tm?.tm_value),tmUnit:tm?.tm_unit || null,tmDate:tm?.effective_at || null,displayEstimate:estimate,displayEstimateUnit:estimateUnit,displayEstimateDate:estimateDate,derivedPoints:derived}
    })
  }
  function trendFor(lift) {
    const points=(lift.derivedPoints || []).slice(-8)
    if (points.length<2) {
      const local=(Array.isArray(lift.history)?lift.history:[]).filter(x=>/estimate|e1rm/i.test(String(x.type||''))&&num(x.value)).sort((a,b)=>(asDate(a.date||a.createdAt)?.getTime()||0)-(asDate(b.date||b.createdAt)?.getTime()||0)).slice(-8)
      if(local.length<2)return{dir:'flat',label:'No trend yet',points:[]}
      return trendFromPoints(local)
    }
    return trendFromPoints(points)
  }
  function trendFromPoints(points) {
    const first=num(points[0].value),last=num(points[points.length-1].value); if(!first||!last)return{dir:'flat',label:'No trend yet',points}
    const pct=(last-first)/first
    return pct>=.015?{dir:'up',label:'Improving',points}:pct<=-.015?{dir:'down',label:'Down recently',points}:{dir:'flat',label:'Stable',points}
  }
  function spark(points,w=220,h=58) {
    const values=points.map(x=>num(x.value)).filter(x=>x!=null)
    if(values.length<2)return'<div class="lmf-pg-empty-chart">More history needed</div>'
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min)
    const coords=values.map((v,i)=>`${(8+i*(w-16)/(values.length-1)).toFixed(1)},${(h-8-(v-min)*(h-16)/span).toFixed(1)}`).join(' ')
    return `<svg class="lmf-pg-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Performance trend"><polyline points="${coords}" fill="none" vector-effect="non-scaling-stroke"/></svg>`
  }
  function bodyChart(points) { return points.length<2?'<div class="lmf-pg-empty-chart is-large">Log at least two bodyweight entries to see a trend.</div>':spark(points.map(x=>({value:x.value})),520,130) }
  function summary(label,value,detail='') { return `<article class="lmf-pg-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>` }
  function rangeLabel(){return range==='7d'?'Last 7 days':range==='30d'?'Last 30 days':'All stored history'}
  function programLabel(program){if(!program)return'Current program';return `${program.program_name || String(program.program_key||'').replace(/-/g,' ') || 'Current program'}${program.current_week?` · Week ${program.current_week}`:''}`}

  function milestone(rows) {
    for(const lift of rows){const actual=num(lift.actual1rm),est=num(lift.displayEstimate);if(actual&&est&&lift.displayEstimateUnit===lift.unit&&est>=actual*1.025)return `Review ${lift.name}: e1RM is above the current tested 1RM.`}
    const missing=rows.find(x=>!num(x.actual1rm));if(missing)return `Record a current tested 1RM for ${missing.name}.`
    const pr=rows.find(x=>!num(x.allTimePr));if(pr)return `Add the all-time PR for ${pr.name}.`
    return 'Keep building verified training history in the current program.'
  }
  function insight(rows,vault) {
    const up=rows.map(lift=>({lift,t:trendFor(lift)})).find(x=>x.t.dir==='up');if(up)return `${up.lift.name} e1RM is trending upward across recent completed sets.`
    if(vault.body.length>=2){const a=vault.body[0],b=vault.body.at(-1),d=Math.round((b.value-a.value)*10)/10;if(d)return `Bodyweight changed ${d>0?'+':''}${d} ${b.unit||'lb'} in the selected range.`}
    const avgEnergy=average(vault.readiness,'energy');if(avgEnergy!=null)return `Average readiness energy is ${avgEnergy}/5 across ${vault.readiness.length} check-in${vault.readiness.length===1?'':'s'}.`
    if(vault.conditioning.length)return `${vault.conditioning.length} conditioning or carry exposure${vault.conditioning.length===1?'':'s'} found in the selected range.`
    return 'More logged training history will unlock stronger trend and milestone insights.'
  }

  function overview(vault,rows) {
    const body=vault.body.at(-1),latest=vault.completedSessions[0]
    return `<div class="lmf-pg-overview">
      <div class="lmf-pg-summary-grid">${summary('Current Program',programLabel(vault.program),vault.program?.current_phase_key ? String(vault.program.current_phase_key).replace(/-/g,' ') : 'Active training context')}${summary('Completed Sessions',String(vault.completedSessions.length),rangeLabel())}${summary('Bodyweight',body?`${formatNumber(body.value)} ${body.unit}`:'—',body?dateLabel(body.date):'No entry found')}${summary('PR / Max Events',String(vault.events.length),rangeLabel())}</div>
      <div class="lmf-pg-two-col"><article class="lmf-pg-panel"><span class="lmf-pg-kicker">PROGRAM MOMENTUM</span><h3>Training Snapshot</h3><div class="lmf-pg-momentum"><strong>${vault.completedSessions.length}</strong><span>completed sessions</span></div><p>${latest?`Latest: ${dateLabel(latest.completed_at||latest.started_at)} · ${esc(latest.workout_name||'Workout')}${latest.week_number?` · W${esc(latest.week_number)}`:''}.`:'No completed session was found in the selected range.'}</p></article><article class="lmf-pg-panel insight"><span class="lmf-pg-kicker">COACH INSIGHT</span><h3>What the data says</h3><p>${esc(insight(rows,vault))}</p><div class="lmf-pg-milestone"><small>NEXT MILESTONE</small><strong>${esc(milestone(rows))}</strong></div></article></div>
      <article class="lmf-pg-panel"><span class="lmf-pg-kicker">STRENGTH SNAPSHOT</span><h3>Main Lift Status</h3><div class="lmf-pg-strength-strip">${rows.slice(0,7).map(lift=>{const t=trendFor(lift);return `<span><b>${esc(lift.name)}</b><strong>${loadText(lift.displayEstimate||lift.actual1rm,lift.displayEstimate?lift.displayEstimateUnit:lift.unit)}</strong><small class="is-${t.dir}">${t.dir==='up'?'↑':t.dir==='down'?'↓':'→'} ${esc(t.label)}</small></span>`}).join('')}</div></article>
      <div class="lmf-pg-two-col"><article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODYWEIGHT TREND</span><h3>${esc(rangeLabel())}</h3>${bodyChart(vault.body)}</article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">RECENT PRs</span><h3>Latest Performance Events</h3>${vault.events.length?`<div class="lmf-pg-mini-feed">${vault.events.slice(0,4).map(x=>`<div><span>${esc(x.liftName)}</span><b>${x.value?loadText(x.value,x.unit):esc(x.display||'PR')}</b><small>${dateLabel(x.date)}</small></div>`).join('')}</div>`:'<div class="lmf-pg-empty compact">No PR or max events in this range yet.</div>'}</article></div>
    </div>`
  }
  function strengthView(rows) {
    return `<div class="lmf-pg-strength-actions"><div><span class="lmf-pg-kicker">STRENGTH RECORDS</span><strong>Actual 1RM, TM, e1RM and all-time PR stay separate.</strong></div><button type="button" data-pg-manage-tms>MANAGE TRAINING MAXES</button><a href="#/profile">EDIT 1RM / PRs IN PROFILE</a></div><div class="lmf-pg-lift-grid">${rows.map(lift=>{const t=trendFor(lift),points=t.points,recent=(lift.derivedPoints||[]).at(-1);return `<article class="lmf-pg-lift-card"><header><div><span>STRENGTH</span><h3>${esc(lift.name)}</h3></div><b class="is-${t.dir}">${t.dir==='up'?'↑':t.dir==='down'?'↓':'→'} ${esc(t.label)}</b></header><div class="lmf-pg-lift-metrics"><span><small>ACTUAL 1RM</small><strong>${loadText(lift.actual1rm,lift.unit)}</strong></span><span class="is-tm"><small>TRAINING MAX</small><strong>${loadText(lift.tmValue,lift.tmUnit)}</strong></span><span><small>e1RM</small><strong>${loadText(lift.displayEstimate,lift.displayEstimateUnit)}</strong></span><span><small>ALL-TIME PR</small><strong>${loadText(lift.allTimePr,lift.unit)}</strong></span><span><small>LAST TESTED</small><strong>${lift.actualDate?dateLabel(lift.actualDate):'—'}</strong></span></div>${spark(points)}<footer>${recent?`Latest completed-set estimate: ${esc(`${formatNumber(recent.load)} ${recent.unit} × ${formatNumber(recent.reps)}${recent.rpe?` @ RPE ${formatNumber(recent.rpe)}`:''}`)} · ${dateLabel(recent.date)}`:'Completed-set estimates will appear here as history builds.'}</footer></article>`}).join('')}</div>`
  }
  function readinessCards(vault) {
    const rows=vault.readiness
    return `<div class="lmf-pg-readiness-grid">${summary('Sleep Quality',average(rows,'sleep_quality')==null?'—':`${formatNumber(average(rows,'sleep_quality'))}/5`,`${rows.length} check-in${rows.length===1?'':'s'}`)}${summary('Energy',average(rows,'energy')==null?'—':`${formatNumber(average(rows,'energy'))}/5`,'Selected range')}${summary('Soreness',average(rows,'soreness')==null?'—':`${formatNumber(average(rows,'soreness'))}/5`,'Lower is generally better')}${summary('Stress',average(rows,'stress')==null?'—':`${formatNumber(average(rows,'stress'))}/5`,'Selected range')}</div>`
  }
  function bodyView(vault) {
    const pts=vault.body,current=pts.at(-1),first=pts[0],delta=current&&first?Math.round((current.value-first.value)*10)/10:null
    return `<div class="lmf-pg-body-stack"><div class="lmf-pg-summary-grid compact">${summary('Current Bodyweight',current?`${formatNumber(current.value)} ${current.unit}`:'—',current?dateLabel(current.date):'No entry found')}${summary('Range Change',delta==null?'—':`${delta>0?'+':''}${formatNumber(delta)} ${current?.unit||'lb'}`,pts.length>=2?`${pts.length} entries`:'Need 2+ entries')}${summary('Entries',String(pts.length),rangeLabel())}</div><article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODY TREND</span><h3>Bodyweight</h3>${bodyChart(pts)}</article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">READINESS AVERAGES</span><h3>Recovery Context</h3>${readinessCards(vault)}</article></div>`
  }
  function conditioningView(vault) {
    const grouped=new Map();vault.conditioning.forEach(x=>grouped.set(x.name,(grouped.get(x.name)||0)+1));const top=[...grouped.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)
    return `<div class="lmf-pg-two-col"><article class="lmf-pg-panel"><span class="lmf-pg-kicker">WORK CAPACITY</span><h3>Conditioning Summary</h3><div class="lmf-pg-big-number">${vault.conditioning.length}</div><p>Conditioning, sled, carry, cardio, GPP, or work-capacity exposures detected from completed/private workout history in the selected range.</p></article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">ACTIVITY MIX</span><h3>Most Logged</h3>${top.length?`<ul class="lmf-pg-simple-list">${top.map(([name,count])=>`<li><span>${esc(name)}</span><b>${count}</b></li>`).join('')}</ul>`:'<div class="lmf-pg-empty compact">No conditioning entries detected yet.</div>'}</article></div>`
  }
  function eventLabel(event) {
    const type=String(event.type||'').toLowerCase()
    if(type.includes('all_time_pr'))return'ALL-TIME PR'
    if(type.includes('actual'))return'ACTUAL 1RM'
    if(type.includes('estimate')||type.includes('e1rm'))return event.kind==='derived-e1rm'?'CALC e1RM':'e1RM'
    return String(event.type || 'PR').replace(/[_-]+/g,' ').toUpperCase()
  }
  function prView(events) {
    if(!events.length)return'<div class="lmf-pg-empty">No PR, max, or estimated-1RM events in this range yet.</div>'
    return `<div class="lmf-pg-feed">${events.slice(0,60).map(x=>{const source=x.load&&x.reps?`${formatNumber(x.load)} ${x.unit} × ${formatNumber(x.reps)}${x.rpe?` @ RPE ${formatNumber(x.rpe)}`:''}`:x.source;return `<article><div class="lmf-pg-pr-badge">${esc(eventLabel(x))}</div><div><h3>${esc(x.liftName)}</h3><strong>${x.value?loadText(x.value,x.unit):esc(x.display||'Recorded PR')}</strong>${source?`<small>${esc(source)}</small>`:''}</div><time>${dateLabel(x.date)}</time></article>`}).join('')}</div>`
  }
  function tab(id,label){return `<button type="button" role="tab" data-pg-tab="${id}" aria-selected="${activeTab===id?'true':'false'}">${label}</button>`}

  function organizeNativeProgress(root) {
    const native=root.querySelector('#progress-content'); if(!native)return
    native.classList.add('lmf-pg-native-content')
    native.querySelectorAll(':scope > .progress-score-grid,:scope > .strength-progress-card,:scope > .v2-analytics').forEach(el=>el.classList.add('lmf-pg-native-duplicate'))
    let tools=native.querySelector('#lmf-pg-native-tools')
    if(!tools){
      tools=document.createElement('details');tools.id='lmf-pg-native-tools';tools.className='lmf-pg-native-tools';tools.open=readSetting(TOOLS_KEY,'closed',['open','closed'])==='open';tools.innerHTML='<summary><div><span>TRAINING DATA</span><strong>Manage TMs & Recent Workout History</strong></div><i>⌄</i></summary><div class="lmf-pg-native-tools-body"></div>'
      tools.addEventListener('toggle',()=>writeSetting(TOOLS_KEY,tools.open?'open':'closed'))
      native.appendChild(tools)
    }
    const body=tools.querySelector('.lmf-pg-native-tools-body')
    const tm=native.querySelector(':scope > .tm-board')
    if(tm)body.appendChild(tm)
    const titles=[...native.querySelectorAll(':scope > .section-title')]
    const historyTitle=titles.find(el=>/recent workouts/i.test(el.textContent||''))
    if(historyTitle)body.appendChild(historyTitle)
    const history=native.querySelector(':scope > .history-list')
    if(history)body.appendChild(history)
  }
  function openNativeTools(root) {
    organizeNativeProgress(root)
    const tools=root.querySelector('#lmf-pg-native-tools'); if(!tools)return
    tools.open=true; writeSetting(TOOLS_KEY,'open'); tools.scrollIntoView({behavior:'smooth',block:'start'})
  }

  async function render(force=false) {
    const h=progressHeading();if(!h)return
    const root=progressRoot(h);if(!root)return
    const token=++generation
    let el=document.getElementById(ROOT_ID)
    if(!el){el=document.createElement('section');el.id=ROOT_ID;el.className='lmf-progress-dashboard';h.insertAdjacentElement('afterend',el)}
    if(force || !el.dataset.loaded) el.innerHTML='<div class="lmf-pg-loading">Reading your private training history…</div>'
    const vault=await readVault(force);if(token!==generation)return
    const rows=mergedLifts(vault)
    el.dataset.loaded='1'
    el.innerHTML=`<header class="lmf-pg-header"><div><span>ATHLETE PERFORMANCE</span><h2>PROGRESS DASHBOARD</h2><p>${vault.source==='indexeddb'?'Private vault data':'Private strength data'} first. Calculated values stay labeled and never rewrite programming.</p></div><select data-pg-range aria-label="Progress date range"><option value="7d" ${range==='7d'?'selected':''}>7 DAYS</option><option value="30d" ${range==='30d'?'selected':''}>30 DAYS</option><option value="all" ${range==='all'?'selected':''}>ALL TIME</option></select></header><nav class="lmf-pg-tabs" role="tablist" aria-label="Progress sections">${tab('overview','OVERVIEW')}${tab('strength','STRENGTH')}${tab('body','BODY')}${tab('conditioning','CONDITIONING')}${tab('prs','PRs')}</nav><div class="lmf-pg-tabbody" role="tabpanel" data-pg-panel="${activeTab}">${activeTab==='overview'?overview(vault,rows):activeTab==='strength'?strengthView(rows):activeTab==='body'?bodyView(vault):activeTab==='conditioning'?conditioningView(vault):prView(vault.events)}</div>`
    const legacy=root.querySelector('#lmf-strength-maxes-progress');if(legacy)legacy.hidden=true
    organizeNativeProgress(root)
    el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}))
    el.querySelector('[data-pg-range]')?.addEventListener('change',event=>{const next=event.target.value;if(!RANGES.includes(next))return;range=next;writeSetting(RANGE_KEY,next);vaultCache.at=0;queueRender(true)})
    el.querySelector('[data-pg-manage-tms]')?.addEventListener('click',()=>openNativeTools(root))
    window.__LMF_PROGRESS_DASHBOARD__={version:2,source:vault.source,refresh:()=>queueRender(true),getTab:()=>activeTab,setTab:next=>{if(TABS.includes(next)){activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}}}
  }

  function queueRender(force=false){if(force)vaultCache.at=0;clearTimeout(timer);timer=setTimeout(()=>void render(force),force?30:160)}
  function queueScan(){if(scanQueued)return;scanQueued=true;requestAnimationFrame(()=>{scanQueued=false;if(progressHeading())queueRender(false)})}
  function boot(){
    queueScan()
    new MutationObserver(records=>{const selfOnly=records.every(r=>r.target instanceof Element && (r.target.closest(`#${ROOT_ID}`)||r.target.closest('#lmf-pg-native-tools')));if(!selfOnly)queueScan()}).observe(document.body,{childList:true,subtree:true})
    window.addEventListener('lmf:strength-maxes-updated',()=>queueRender(true))
    window.addEventListener('storage',event=>{if(!event.key||event.key===MAXES_KEY||/workout|history|readiness|profile|body|weight|progress/i.test(event.key))queueRender(true)})
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueRender(true)})
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
})()