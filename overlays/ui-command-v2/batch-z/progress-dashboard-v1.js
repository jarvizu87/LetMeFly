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
  let timerForce = false
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
    const db=await openExistingDb(); if (!db) return empty
    try {
      const athlete=await chooseAthlete(db); if(!athlete){db.close();return empty}
      const names=['programInstances','trainingMaxes','workoutSessions','workoutExercises','workoutSets','bodyweightEntries','readinessEntries','personalRecords']
      const values=await Promise.all(names.map(name=>readStoreForAthlete(db,name,athlete.id)))
      db.close()
      const [programs,tms,sessions,exercises,sets,body,readiness,prs]=values
      const program=byNewest(programs,'updated_at')[0] || byNewest(programs,'created_at')[0] || null
      const tmMap=latestTmMap(tms)
      const completedSessions=sessions.filter(x=>x.status==='completed').filter(x=>inRange(x.completed_at || x.started_at))
      const filteredSessions=sessions.filter(x=>inRange(x.completed_at || x.started_at))
      const sessionIds=new Set(filteredSessions.map(x=>x.id))
      const filteredExercises=exercises.filter(x=>sessionIds.has(x.workout_session_id))
      const exerciseIds=new Set(filteredExercises.map(x=>x.id))
      const filteredSets=sets.filter(x=>exerciseIds.has(x.workout_exercise_id) && inRange(setDate(x,filteredSessions.find(s=>s.id===(x.workout_session_id||filteredExercises.find(e=>e.id===x.workout_exercise_id)?.workout_session_id)))))
      const data={source:'indexeddb',athlete,program,tms:tmMap,sessions:filteredSessions,completedSessions,workoutExercises:filteredExercises,workoutSets:filteredSets,body:bodyRows(body,athlete),readiness:readiness.filter(x=>inRange(x.recorded_at || x.created_at)),personalRecords:prs.filter(x=>inRange(x.achieved_at || x.created_at)),conditioning:conditioningRows(filteredExercises,filteredSessions),e1rm:null,events:null}
      data.e1rm=deriveE1rm(data.workoutExercises,data.workoutSets,data.sessions);data.events=dedupeEvents([...corePrEvents(data.personalRecords),...derivedE1rmEvents(data.e1rm),...localMaxEvents()])
      vaultCache={at:now,range,data};return data
    } catch (_) { try{db.close()}catch(__){};return empty }
  }

  function currentTm(vault,liftId){const row=resolveTm(vault.tms,liftId);return row?{value:num(row.tm_value),unit:String(row.tm_unit||'lb').toLowerCase()==='kg'?'kg':'lb'}:null}
  function mergedLifts(vault){return LIFT_META.map(meta=>{const local=localStrengthRows().find(x=>x.id===meta.id);const tm=currentTm(vault,meta.id);const points=vault.e1rm.get(meta.id)||[];const best=points.reduce((a,b)=>!a||b.value>a.value?b:a,null);const latest=points.at(-1)||null;return{...meta,local,tm,best,latest,points}})}
  function tab(id,label){return `<button type="button" class="${activeTab===id?'active':''}" data-pg-tab="${id}" role="tab" aria-selected="${activeTab===id?'true':'false'}">${label}</button>`}
  function readinessLabel(vault){const row=byNewest(vault.readiness,'recorded_at')[0]||byNewest(vault.readiness,'created_at')[0];if(!row)return{value:'—',label:'No check-in'};const raw=[row.sleep_quality,row.energy,row.soreness?6-num(row.soreness):null,row.stress?6-num(row.stress):null].filter(x=>num(x)!=null);const score=raw.length?Math.round(raw.reduce((a,b)=>a+num(b),0)/raw.length*20):null;return{value:score==null?'—':String(score),label:score==null?'Readiness recorded':score>=80?'Ready to push':score>=60?'Train as written':'Use allowed auto-regulation'}}
  function coachInsight(vault,rows){const r=readinessLabel(vault);const recent=vault.completedSessions.length;const active=rows.filter(x=>x.tm?.value||x.local?.trainingMax||x.local?.actualMax).length;return r.value==='—'?`Log readiness and complete a session to unlock athlete-aware trends. ${active?`${active} strength profiles are already tracked.`:''}`:`Readiness is ${r.value}/100 (${r.label.toLowerCase()}). ${recent?`${recent} completed session${recent===1?'':'s'} are in this view.`:'Finish a workout to start the performance trend.'}`}
  function nextMilestone(rows){const candidates=rows.filter(x=>x.local?.actualMax&&x.local?.goalMax).map(x=>({name:x.name,current:num(x.local.actualMax),goal:num(x.local.goalMax),unit:x.local.unit||'lb'})).filter(x=>x.current&&x.goal&&x.goal>x.current).map(x=>({...x,gap:x.goal-x.current,pct:x.current/x.goal})).sort((a,b)=>b.pct-a.pct);if(!candidates.length)return{title:'Build the baseline',copy:'Set an actual max and goal in Strength Maxes; LetMeFly will surface the nearest target here.'};const x=candidates[0];return{title:`${x.name}: ${formatNumber(x.current)} → ${formatNumber(x.goal)} ${x.unit}`,copy:`${formatNumber(x.gap)} ${x.unit} to the next strength goal.`}}
  function overview(vault,rows){const r=readinessLabel(vault);const tm=rows.filter(x=>x.tm?.value).length;const bw=vault.body.at(-1);const milestone=nextMilestone(rows);return `<div class="lmf-pg-kpis"><article><span>READINESS</span><strong>${r.value}${r.value==='—'?'':'%'}</strong><small>${r.label}</small></article><article><span>SESSIONS</span><strong>${vault.completedSessions.length}</strong><small>${range==='all'?'All recorded':'Selected range'}</small></article><article><span>TRAINING MAXES</span><strong>${tm}</strong><small>Authoritative TM records</small></article><article><span>BODYWEIGHT</span><strong>${bw?loadText(bw.value,bw.unit):'—'}</strong><small>${bw?dateLabel(bw.date):'No entries yet'}</small></article></div><div class="lmf-pg-insight"><div><span>COACH INSIGHT</span><h3>${esc(coachInsight(vault,rows))}</h3></div><a href="#/coach">ASK COACH</a></div><div class="lmf-pg-milestone"><span>NEXT MILESTONE</span><strong>${esc(milestone.title)}</strong><small>${esc(milestone.copy)}</small></div><div class="lmf-pg-chart"><div class="lmf-pg-section-head"><div><span>STRENGTH TREND</span><h3>e1RM vs TM vs Max</h3></div><small>Calculated e1RM is derived only from completed sets.</small></div>${spark(rows)}</div>`}
  function spark(rows){const candidates=rows.filter(x=>x.points.length||x.tm?.value||x.local?.trainingMax||x.local?.actualMax).slice(0,4);if(!candidates.length)return'<div class="lmf-pg-empty">No completed strength sets yet. Training Maxes remain available below.</div>';return `<div class="lmf-pg-spark-grid">${candidates.map(row=>{const pts=row.points.slice(-10);const all=[...pts.map(x=>x.value),num(row.tm?.value),num(row.local?.trainingMax),num(row.local?.actualMax)].filter(x=>x&&x>0);const min=Math.min(...all)*.92,max=Math.max(...all)*1.05,span=Math.max(1,max-min);const coords=pts.map((p,i)=>`${pts.length===1?50:i/(pts.length-1)*100},${100-(p.value-min)/span*100}`).join(' ');return `<article><header><strong>${esc(row.name)}</strong><small>${row.latest?`e1RM ${loadText(row.latest.value,row.latest.unit)}`:'No e1RM yet'}</small></header><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="${esc(row.name)} trend">${row.tm?.value?`<line x1="0" x2="100" y1="${100-(row.tm.value-min)/span*100}" y2="${100-(row.tm.value-min)/span*100}" class="tm"/>`:''}${row.local?.actualMax?`<line x1="0" x2="100" y1="${100-(row.local.actualMax-min)/span*100}" y2="${100-(row.local.actualMax-min)/span*100}" class="max"/>`:''}${coords?`<polyline points="${coords}" class="e1rm"/>`:''}</svg><footer><span>e1RM</span><span>TM</span><span>MAX</span></footer></article>`}).join('')}</div>`}
  function strengthView(rows){const cards=rows.map(row=>`<article class="lmf-pg-lift"><header><div><span>${esc(row.name)}</span><strong>${row.latest?loadText(row.latest.value,row.latest.unit):'—'}</strong><small>Latest e1RM</small></div><div><span>TM</span><strong>${row.tm?loadText(row.tm.value,row.tm.unit):row.local?.trainingMax?loadText(row.local.trainingMax,row.local.unit):'—'}</strong></div><div><span>MAX</span><strong>${row.local?.actualMax?loadText(row.local.actualMax,row.local.unit):'—'}</strong></div></header>${spark([row])}</article>`).join('');return `<div class="lmf-pg-section-head"><div><span>STRENGTH</span><h3>Max / TM / estimated performance</h3></div><button type="button" data-pg-manage-tms>MANAGE MAXES & TMs</button></div><div class="lmf-pg-lifts">${cards}</div>`}
  function bodyView(vault){const body=vault.body;if(!body.length)return'<div class="lmf-pg-empty">No bodyweight entries yet. Add them through Profile or the connected private-data tools.</div>';const first=body[0],last=body.at(-1),delta=last.value-first.value;return `<div class="lmf-pg-kpis body"><article><span>CURRENT</span><strong>${loadText(last.value,last.unit)}</strong><small>${dateLabel(last.date)}</small></article><article><span>CHANGE</span><strong>${delta>0?'+':''}${formatNumber(delta)} ${last.unit}</strong><small>${dateLabel(first.date)} → ${dateLabel(last.date)}</small></article></div><div class="lmf-pg-body-list">${body.slice(-12).reverse().map(x=>`<div><span>${dateLabel(x.date)}</span><strong>${loadText(x.value,x.unit)}</strong></div>`).join('')}</div>`}
  function conditioningView(vault){const rows=vault.conditioning;if(!rows.length)return'<div class="lmf-pg-empty">No conditioning/carry sessions are identifiable in this range yet. Completed sled, carry, erg, run, bike, and GPP work will appear here.</div>';const counts=new Map();for(const row of rows){const key=row.name||row.category||'Conditioning';counts.set(key,(counts.get(key)||0)+1)}return `<div class="lmf-pg-section-head"><div><span>CONDITIONING</span><h3>Work-capacity exposure</h3></div><small>Completed-session exercise records</small></div><div class="lmf-pg-conditioning">${[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`<article><span>${esc(name)}</span><strong>${count}</strong><small>session exposure${count===1?'':'s'}</small></article>`).join('')}</div>`}
  function prView(events){if(!events.length)return'<div class="lmf-pg-empty">No PRs detected in this range yet. LetMeFly combines stored PR records with clearly labeled derived e1RM improvements.</div>';return `<div class="lmf-pg-section-head"><div><span>PERSONAL RECORDS</span><h3>Recent breakthroughs</h3></div><small>Stored + labeled derived records</small></div><div class="lmf-pg-prs">${events.slice(0,30).map(event=>`<article><span>${esc(String(event.type).replace(/_/g,' ').toUpperCase())}</span><strong>${esc(event.liftName||'Performance')}</strong><b>${event.display?esc(event.display):loadText(event.value,event.unit)}</b><small>${dateLabel(event.date)}${event.source?` • ${esc(event.source)}`:''}</small></article>`).join('')}</div>`}
  function nativeProgressContainer(root){return root.querySelector('#progress-content')}
  function organizeNativeProgress(root){const native=nativeProgressContainer(root);if(!native)return;let details=root.querySelector('#lmf-pg-native-tools');if(!details){details=document.createElement('details');details.id='lmf-pg-native-tools';details.className='lmf-pg-native-tools';details.innerHTML='<summary>MANAGE TRAINING MAXES & VIEW RAW HISTORY</summary><div data-pg-native-body></div>';document.getElementById(ROOT_ID)?.insertAdjacentElement('afterend',details)}const body=details.querySelector('[data-pg-native-body]');if(body&&native.parentElement!==body)body.appendChild(native);details.open=readSetting(TOOLS_KEY,'closed',['open','closed'])==='open';details.addEventListener('toggle',()=>writeSetting(TOOLS_KEY,details.open?'open':'closed'))}
  function openNativeTools(root){organizeNativeProgress(root);const details=root.querySelector('#lmf-pg-native-tools');if(details){details.open=true;writeSetting(TOOLS_KEY,'open');details.scrollIntoView({behavior:'smooth',block:'start'})}}
  function progressHeading(){
    const anchored = document.querySelector('[data-lmf-progress-anchor]')
    if (anchored && anchored.isConnected) return anchored
    const hash = location.hash || ''
    const routeActive = /^#\/progress(?:[/?#]|$)/i.test(hash)
    const headings=[...document.querySelectorAll('main h1,main h2,main h3,[role="main"] h1,[role="main"] h2,[role="main"] h3,.page-head h1,.page-head h2')]
    const exact = headings.find(h=>(h.textContent||'').trim().toUpperCase()==='PROGRESS' && !h.closest('nav,button,a,[role="button"]'))
    if (exact) return exact
    if (routeActive) {
      const native = document.querySelector('#progress-content')
      if (native?.parentElement) return native.parentElement
      const root = document.querySelector('main,[role="main"],#app')
      if (root) return root
    }
    return null
  }
  function progressRoot(h){return h.closest('main,[role="main"]')||document.querySelector('main,[role="main"],#app')||h.parentElement}
  function render(force=false) {
    const h=progressHeading();if(!h)return
    const root=progressRoot(h);if(!root)return
    const token=++generation
    let el=document.getElementById(ROOT_ID)
    if(!el){el=document.createElement('section');el.id=ROOT_ID;el.className='lmf-progress-dashboard';h.insertAdjacentElement('afterend',el)}
    if(force || !el.dataset.loaded) el.innerHTML='<div class="lmf-pg-loading">Reading your private training history…</div>'
    return readVault(force).then(vault=>{
      if(token!==generation)return
      const rows=mergedLifts(vault)
      el.dataset.loaded='1'
      el.innerHTML=`<header class="lmf-pg-header"><div><span>ATHLETE PERFORMANCE</span><h2>PROGRESS DASHBOARD</h2><p>${vault.source==='indexeddb'?'Private vault data':'Private strength data'} first. Calculated values stay labeled and never rewrite programming.</p></div><select data-pg-range aria-label="Progress date range"><option value="7d" ${range==='7d'?'selected':''}>7 DAYS</option><option value="30d" ${range==='30d'?'selected':''}>30 DAYS</option><option value="all" ${range==='all'?'selected':''}>ALL TIME</option></select></header><nav class="lmf-pg-tabs" role="tablist" aria-label="Progress sections">${tab('overview','OVERVIEW')}${tab('strength','STRENGTH')}${tab('body','BODY')}${tab('conditioning','CONDITIONING')}${tab('prs','PRs')}</nav><div class="lmf-pg-tabbody" role="tabpanel" data-pg-panel="${activeTab}">${activeTab==='overview'?overview(vault,rows):activeTab==='strength'?strengthView(rows):activeTab==='body'?bodyView(vault):activeTab==='conditioning'?conditioningView(vault):prView(vault.events)}</div>`
      const legacy=root.querySelector('#lmf-strength-maxes-progress');if(legacy)legacy.hidden=true
      organizeNativeProgress(root)
      el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}))
      el.querySelector('[data-pg-range]')?.addEventListener('change',event=>{const next=event.target.value;if(!RANGES.includes(next))return;range=next;writeSetting(RANGE_KEY,next);vaultCache.at=0;queueRender(true)})
      el.querySelector('[data-pg-manage-tms]')?.addEventListener('click',()=>openNativeTools(root))
      window.__LMF_PROGRESS_DASHBOARD__={version:2,source:vault.source,refresh:()=>queueRender(true),getTab:()=>activeTab,setTab:next=>{if(TABS.includes(next)){activeTab=next;writeSetting(TAB_KEY,next);queueRender(false)}}}
    })
  }

  function queueRender(force=false) {
    if (force) vaultCache.at=0
    // A normal SPA/MutationObserver pulse must never postpone an already queued
    // render. Previously every mutation cleared and restarted the 160 ms timer,
    // so a busy fresh route could starve Progress forever. Forced data refreshes
    // are allowed to supersede a normal pending render and run sooner.
    if (timer && !force) return
    if (timer) clearTimeout(timer)
    timerForce = Boolean(force)
    timer = setTimeout(() => {
      const runForce = timerForce
      timer = 0
      timerForce = false
      void render(runForce)
    }, force ? 30 : 80)
  }
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
