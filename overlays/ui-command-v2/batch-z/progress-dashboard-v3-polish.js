(() => {
  'use strict'

  const ROOT_ID = 'lmf-progress-dashboard-v1'
  const DB_NAME = 'letmefly-private'
  const RANGE_KEY = 'letmefly_progress_dashboard_range_v1'
  const MAXES_KEY = 'letmefly_private_strength_maxes_v1'
  const LIFTS = [
    { id:'back-squat', name:'Back Squat', aliases:['back squat','back-squat'] },
    { id:'front-squat', name:'Front Squat', aliases:['front squat','front-squat'] },
    { id:'bench-press', name:'Bench Press', aliases:['bench press','bench-press','barbell bench press'] },
    { id:'deadlift', name:'Deadlift', aliases:['deadlift','conventional deadlift'] },
    { id:'overhead-press', name:'Overhead Press', aliases:['overhead press','overhead-press','ohp','strict press'] },
    { id:'power-clean', name:'Power Clean', aliases:['power clean','power-clean','clean'] },
    { id:'power-snatch', name:'Power Snatch', aliases:['power snatch','power-snatch','snatch'] },
  ]
  const CONDITIONING_RE = /sled|carry|farmer|suitcase|yoke|bike|rower|rowing|treadmill|conditioning|cardio|walk|run|assault|erg|gpp|work.?capacity/i
  let timer = 0
  let busy = false

  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null }
  function date(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d }
  function fmt(value) { const n = num(value); return n == null ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10) }
  function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])) }
  function normalize(value) { return String(value || '').toLowerCase().replace(/[–—]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }
  function liftId(value) {
    const clean = normalize(value)
    for (const lift of LIFTS) if (lift.aliases.some(alias => clean === normalize(alias) || clean.includes(normalize(alias)))) return lift.id
    return null
  }
  function rangeCutoff() {
    let range = '30d'
    try { range = localStorage.getItem(RANGE_KEY) || '30d' } catch (_) {}
    if (range === 'all') return null
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (range === '7d' ? 6 : 29)); return d
  }
  function inRange(value) { const cutoff = rangeCutoff(); if (!cutoff) return true; const d = date(value); return Boolean(d && d >= cutoff) }
  function dateLabel(value) {
    const d = date(value); if (!d) return '—'
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d) } catch (_) { return d.toISOString().slice(5,10) }
  }
  function request(req) { return new Promise((resolve,reject) => { req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error || new Error('IndexedDB request failed')) }) }
  async function openDb() {
    if (!('indexedDB' in window)) return null
    try {
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases()
        if (!dbs.some(item => item.name === DB_NAME)) return null
      }
    } catch (_) {}
    return new Promise(resolve => {
      let req
      try { req = indexedDB.open(DB_NAME) } catch (_) { resolve(null); return }
      let upgrade = false
      req.onupgradeneeded = () => { upgrade = true; try { req.transaction.abort() } catch (_) {} }
      req.onerror = () => resolve(null)
      req.onsuccess = () => { const db=req.result; if (upgrade || !db.objectStoreNames.contains('athletes')) { try { db.close() } catch (_) {}; resolve(null); return }; resolve(db) }
    })
  }
  async function rowsForAthlete(db, storeName, athleteId=null) {
    if (!db?.objectStoreNames.contains(storeName)) return []
    try {
      const store=db.transaction(storeName,'readonly').objectStore(storeName)
      let rows
      if(athleteId && store.indexNames.contains('by-athlete')) rows=await request(store.index('by-athlete').getAll(athleteId))
      else rows=await request(store.getAll())
      rows=(Array.isArray(rows)?rows:[]).filter(x=>x&&!x.deleted_at)
      if(!athleteId || store.indexNames.contains('by-athlete'))return rows
      return rows.filter(x=>{const owner=x.athlete_id??x.athleteId??x.athlete;return owner==null||owner===athleteId})
    } catch (_) { return [] }
  }
  async function privateData() {
    const db = await openDb(); if (!db) return null
    try {
      const athletes = await rowsForAthlete(db,'athletes'); if (!athletes.length) return null
      const athlete = [...athletes].sort((a,b)=>(date(b.updated_at||b.created_at)?.getTime()||0)-(date(a.updated_at||a.created_at)?.getTime()||0))[0]
      const id = athlete.id
      const [sessionsRaw, exercisesRaw, setsRaw, bodyRaw] = await Promise.all([rowsForAthlete(db,'workoutSessions',id),rowsForAthlete(db,'workoutExercises',id),rowsForAthlete(db,'workoutSets',id),rowsForAthlete(db,'bodyweightEntries',id)])
      const sessions = sessionsRaw.filter(x => inRange(x.completed_at || x.started_at || x.created_at))
      const sessionIds = new Set(sessions.map(x => x.id))
      const exercises = exercisesRaw.filter(x => sessionIds.has(x.workout_session_id))
      const exerciseIds = new Set(exercises.map(x => x.id))
      const sets = setsRaw.filter(x => sessionIds.has(x.workout_session_id) || exerciseIds.has(x.workout_exercise_id))
      const body = bodyRaw.filter(x => inRange(x.measured_at || x.recorded_at || x.created_at)).map(x => ({date:x.measured_at||x.recorded_at||x.created_at,value:num(x.value??x.bodyweight_value??x.weight_value??x.weight),unit:String(x.unit||x.bodyweight_unit||x.weight_unit||athlete.default_weight_unit||'lb').toLowerCase()==='kg'?'kg':'lb'})).filter(x=>x.value&&x.value>50&&x.value<700).sort((a,b)=>(date(a.date)?.getTime()||0)-(date(b.date)?.getTime()||0))
      return { athlete, sessions, exercises, sets, body }
    } finally { try { db.close() } catch (_) {} }
  }
  function e1rm(load,reps,unit) {
    const l=num(load), r=num(reps); if (!l || !r || r < 1 || r > 15) return null
    const raw=l*(1+r/30), step=unit==='kg'?.5:1
    return Math.round(raw/step)*step
  }
  function strengthPoints(data) {
    const sessions = new Map(data.sessions.map(x=>[x.id,x]))
    const exercises = new Map(data.exercises.map(x=>[x.id,x]))
    const perLift = new Map()
    for (const set of data.sets) {
      if (!set.completed) continue
      const exercise=exercises.get(set.workout_exercise_id); if(!exercise) continue
      const id=liftId(exercise.exercise_key || exercise.exercise_name_snapshot); if(!id) continue
      const unit=String(set.load_unit||'lb').toLowerCase()==='kg'?'kg':'lb'
      const value=e1rm(set.load_value,set.reps,unit); if(!value) continue
      const session=sessions.get(set.workout_session_id || exercise.workout_session_id)
      const when=set.completed_at || session?.completed_at || session?.started_at || set.updated_at || set.created_at
      if(!when || !inRange(when)) continue
      if(!perLift.has(id)) perLift.set(id,[])
      perLift.get(id).push({value,unit,date:when,load:num(set.load_value),reps:num(set.reps),rpe:num(set.rpe)})
    }
    for (const [id, points] of perLift) {
      points.sort((a,b)=>(date(a.date)?.getTime()||0)-(date(b.date)?.getTime()||0))
      const bestDay=new Map()
      for(const point of points){const key=(date(point.date)||new Date(0)).toISOString().slice(0,10);const prev=bestDay.get(key);if(!prev||point.value>prev.value)bestDay.set(key,point)}
      perLift.set(id,[...bestDay.values()])
    }
    return perLift
  }
  function localMaxes() {
    try { return window.__LMF_STRENGTH_MAXES__?.get?.() || JSON.parse(localStorage.getItem(MAXES_KEY) || 'null') } catch (_) { return null }
  }
  function enhanceSparks(root, points) {
    root.querySelectorAll('.lmf-pg-lift-card').forEach(card => {
      const id=liftId(card.querySelector('h3')?.textContent); const pts=id?points.get(id)||[]:[]
      const svg=card.querySelector('.lmf-pg-spark'); const empty=card.querySelector('.lmf-pg-empty-chart')
      card.querySelector('.lmf-pg-trend-caption')?.remove()
      if (empty && pts.length < 2) empty.textContent='Complete two logged working exposures to unlock this trend.'
      if (!svg || pts.length < 2) return
      const values=pts.slice(-8), first=values[0], last=values.at(-1), delta=Math.round((last.value-first.value)*10)/10
      const caption=document.createElement('div');caption.className='lmf-pg-trend-caption';caption.innerHTML=`<span>${esc(dateLabel(first.date))} · ${esc(fmt(first.value))} ${esc(first.unit)}</span><b class="${delta>0?'is-up':delta<0?'is-down':'is-flat'}">${delta>0?'+':''}${esc(fmt(delta))} ${esc(last.unit)}</b><span>${esc(dateLabel(last.date))} · ${esc(fmt(last.value))} ${esc(last.unit)}</span>`
      svg.insertAdjacentElement('afterend',caption)
      const poly=svg.querySelector('polyline'); if(!poly || svg.querySelector('.lmf-pg-end-dot')) return
      const coords=(poly.getAttribute('points')||'').trim().split(/\s+/).map(pair=>pair.split(',').map(Number)).filter(pair=>pair.length===2&&pair.every(Number.isFinite))
      if(coords.length<2)return
      for(const [x,y,cls] of [[...coords[0],'lmf-pg-start-dot'],[...coords.at(-1),'lmf-pg-end-dot']]){const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r','3.2');c.setAttribute('class',cls);svg.appendChild(c)}
    })
  }
  function strengthSummary(root, points) {
    const grid=root.querySelector('.lmf-pg-lift-grid'); if(!grid || root.querySelector('.lmf-pg-strength-trend-summary'))return
    const tracked=[...points.values()].filter(x=>x.length).length
    const trending=[...points.entries()].map(([id,p])=>({id,p:p.slice(-8)})).filter(x=>x.p.length>=2).map(x=>({...x,delta:x.p.at(-1).value-x.p[0].value})).sort((a,b)=>b.delta-a.delta)
    const best=trending[0]
    const name=LIFTS.find(x=>x.id===best?.id)?.name || '—'
    const html=`<div class="lmf-pg-strength-trend-summary"><article><span>TREND COVERAGE</span><strong>${tracked}/${LIFTS.length}</strong><small>lifts with completed-set e1RM data</small></article><article><span>ACTIVE TRENDS</span><strong>${trending.length}</strong><small>lifts with 2+ daily points</small></article><article><span>BEST RANGE GAIN</span><strong>${best&&best.delta>0?`+${esc(fmt(best.delta))} ${esc(best.p.at(-1).unit)}`:'—'}</strong><small>${esc(best&&best.delta>0?name:'More history needed')}</small></article></div>`
    grid.insertAdjacentHTML('beforebegin',html)
  }
  function metricFromPrescription(snapshot, names) {
    if(!snapshot || typeof snapshot!=='object')return null
    const stack=[snapshot]
    while(stack.length){const item=stack.pop();for(const [key,value] of Object.entries(item)){const clean=normalize(key);if(names.some(name=>clean===normalize(name))){if(typeof value==='number'||typeof value==='string')return value}if(value&&typeof value==='object')stack.push(value)}}
    return null
  }
  function conditioningData(data) {
    const sessionMap=new Map(data.sessions.map(x=>[x.id,x]))
    const setsByExercise=new Map()
    for(const set of data.sets){if(!setsByExercise.has(set.workout_exercise_id))setsByExercise.set(set.workout_exercise_id,[]);setsByExercise.get(set.workout_exercise_id).push(set)}
    return data.exercises.map(exercise=>{
      const name=String(exercise.exercise_name_snapshot||exercise.exercise_key||'Conditioning')
      const category=String(exercise.prescription_snapshot?.category||'')
      if(!CONDITIONING_RE.test(`${name} ${category}`))return null
      const session=sessionMap.get(exercise.workout_session_id);const when=session?.completed_at||session?.started_at
      const sets=(setsByExercise.get(exercise.id)||[]).filter(x=>x.completed)
      const load=sets.map(x=>num(x.load_value)).filter(x=>x&&x>0)
      const reps=sets.map(x=>num(x.reps)).filter(x=>x&&x>0)
      return {name,date:when,sessionId:exercise.workout_session_id,sets:sets.length,heaviest:load.length?Math.max(...load):null,unit:String(sets.find(x=>num(x.load_value)>0)?.load_unit||'lb').toLowerCase()==='kg'?'kg':'lb',reps:reps.reduce((a,b)=>a+b,0),distance:metricFromPrescription(exercise.prescription_snapshot,['distance','distance_value','meters','yards']),duration:metricFromPrescription(exercise.prescription_snapshot,['duration','duration_seconds','time','time_seconds'])}
    }).filter(Boolean).sort((a,b)=>(date(b.date)?.getTime()||0)-(date(a.date)?.getTime()||0))
  }
  function enhanceConditioning(root, data) {
    const body=root.querySelector('[data-pg-panel="conditioning"]'); if(!body || body.querySelector('.lmf-pg-conditioning-metrics'))return
    const rows=conditioningData(data), sessions=new Set(rows.map(x=>x.sessionId).filter(Boolean)), completedSets=rows.reduce((a,b)=>a+b.sets,0)
    const loaded=rows.filter(x=>x.heaviest), heaviest=loaded.sort((a,b)=>b.heaviest-a.heaviest)[0]
    const metrics=`<div class="lmf-pg-conditioning-metrics"><article><span>UNIQUE SESSIONS</span><strong>${sessions.size}</strong><small>with conditioning / carries</small></article><article><span>COMPLETED SETS</span><strong>${completedSets}</strong><small>across detected activities</small></article><article><span>LOADED EXPOSURES</span><strong>${loaded.length}</strong><small>sled / carry efforts with load</small></article><article><span>HEAVIEST LOGGED</span><strong>${heaviest?`${esc(fmt(heaviest.heaviest))} ${esc(heaviest.unit)}`:'—'}</strong><small>${heaviest?esc(heaviest.name):'No loaded effort yet'}</small></article></div>`
    body.insertAdjacentHTML('afterbegin',metrics)
    if(rows.length){const recent=`<article class="lmf-pg-panel lmf-pg-conditioning-recent"><span class="lmf-pg-kicker">RECENT CONDITIONING</span><h3>Latest Detected Work</h3><div>${rows.slice(0,8).map(row=>`<span><b>${esc(row.name)}</b><small>${row.sets?`${row.sets} completed set${row.sets===1?'':'s'}`:'programmed exposure'}${row.heaviest?` · top ${esc(fmt(row.heaviest))} ${esc(row.unit)}`:''}</small><time>${esc(dateLabel(row.date))}</time></span>`).join('')}</div></article>`;body.insertAdjacentHTML('beforeend',recent)}
    else body.querySelector('.lmf-pg-empty')?.replaceChildren(document.createTextNode('No conditioning data is logged in this range yet. Sleds, carries, GPP, rowing, biking, and similar work will appear automatically after completion.'))
  }
  function enhancePrs(root) {
    const body=root.querySelector('[data-pg-panel="prs"]'); if(!body || body.querySelector('.lmf-pg-pr-legend'))return
    const feed=body.querySelector('.lmf-pg-feed')
    if(!feed){const empty=body.querySelector('.lmf-pg-empty');if(empty)empty.textContent='No verified PR/max events or calculated e1RM records are available in this range yet.';return}
    feed.insertAdjacentHTML('beforebegin','<div class="lmf-pg-pr-legend"><span><i class="verified"></i>Stored record</span><span><i class="calculated"></i>Calculated e1RM</span><span><i class="max"></i>Max / testing record</span></div>')
    feed.querySelectorAll('article').forEach(article=>{const badge=article.querySelector('.lmf-pg-pr-badge');if(!badge)return;const text=(badge.textContent||'').toLowerCase();const cls=text.includes('calc')||text.includes('e1rm')?'is-calculated':text.includes('1rm')||text.includes('max')?'is-max':'is-verified';badge.classList.add(cls)})
  }
  function improveMilestone(root, points) {
    const target=root.querySelector('.lmf-pg-milestone strong'); if(!target)return
    const state=localMaxes(), lifts=state?.lifts||{}
    for(const [id, pts] of points){if(!pts.length)continue;const lift=lifts[id];const actual=num(lift?.actual1rm);const latest=pts.at(-1);const unit=lift?.unit||latest.unit;if(actual&&latest.unit===unit&&latest.value>=actual*1.025){target.textContent=`${lift?.name||LIFTS.find(x=>x.id===id)?.name||'This lift'} e1RM is above the tested 1RM. Keep programming unchanged; retest only when the program calls for it.`;return}}
    const rising=[...points.entries()].map(([id,p])=>({id,p:p.slice(-8)})).filter(x=>x.p.length>=2&&x.p.at(-1).value>x.p[0].value*1.015).sort((a,b)=>(b.p.at(-1).value-b.p[0].value)-(a.p.at(-1).value-a.p[0].value))[0]
    if(rising){const latest=rising.p.at(-1),next=Math.floor(latest.value/5)*5+5,name=LIFTS.find(x=>x.id===rising.id)?.name||'Main lift';target.textContent=`${name} is trending upward. Next performance marker: ${fmt(next)} ${latest.unit} e1RM while staying inside the current program rules.`;return}
    const total=[...points.values()].reduce((n,p)=>n+p.length,0)
    if(total<2)target.textContent='Complete two logged main-lift exposures so LetMeFly can establish a real performance trend without changing the program.'
  }
  function enhanceBody(root, data) {
    const body=root.querySelector('[data-pg-panel="body"], .lmf-pg-overview'); if(!body || data.body.length<2)return
    body.querySelectorAll('.lmf-pg-panel.chart .lmf-pg-spark').forEach(svg=>{if(svg.parentElement.querySelector('.lmf-pg-body-caption'))return;const first=data.body[0],last=data.body.at(-1),delta=Math.round((last.value-first.value)*10)/10;svg.insertAdjacentHTML('afterend',`<div class="lmf-pg-body-caption"><span>${esc(dateLabel(first.date))} · ${esc(fmt(first.value))} ${esc(first.unit)}</span><b>${delta>0?'+':''}${esc(fmt(delta))} ${esc(last.unit)}</b><span>${esc(dateLabel(last.date))} · ${esc(fmt(last.value))} ${esc(last.unit)}</span></div>`)})
  }
  async function enhance() {
    const root=document.getElementById(ROOT_ID); if(!root || busy)return
    busy=true
    try {
      const data=await privateData(); if(!data)return
      const points=strengthPoints(data)
      enhanceSparks(root,points)
      strengthSummary(root,points)
      enhanceConditioning(root,data)
      enhancePrs(root)
      improveMilestone(root,points)
      enhanceBody(root,data)
      root.dataset.polish='3'
      window.__LMF_PROGRESS_POLISH__={version:3,refresh:()=>schedule(0)}
    } catch(error) { console.warn('LetMeFly Progress polish skipped',error) }
    finally { busy=false }
  }
  function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void enhance(),delay)}
  function boot(){schedule(0);new MutationObserver(records=>{if(records.some(record=>record.target instanceof Element&&record.target.closest?.(`#${ROOT_ID}`)))schedule()}).observe(document.body,{childList:true,subtree:true});window.addEventListener('lmf:strength-maxes-updated',()=>schedule(30));document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(30)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
})()
