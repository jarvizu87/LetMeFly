(() => {
  'use strict'

  const ROOT_ID = 'lmf-progress-dashboard-v1'
  const TAB_KEY = 'letmefly_progress_dashboard_tab_v1'
  const RANGE_KEY = 'letmefly_progress_dashboard_range_v1'
  const MAXES_KEY = 'letmefly_private_strength_maxes_v1'
  const TABS = ['overview', 'strength', 'body', 'conditioning', 'prs']
  const RANGES = ['7d', '30d', 'all']
  let activeTab = readSetting(TAB_KEY, 'overview', TABS)
  let range = readSetting(RANGE_KEY, '30d', RANGES)
  let queued = false
  let timer = 0
  let cache = { at:0, range:'', data:null }

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
  function cutoff() {
    if (range === 'all') return null
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (range === '7d' ? 6 : 29)); return d
  }
  function inRange(value) { const c = cutoff(); if (!c) return true; const d = asDate(value); return Boolean(d && d >= c) }
  function loadText(value, unit='lb') { const n = num(value); return n && n > 0 ? `${n} ${unit || 'lb'}` : '—' }

  function maxState() {
    try {
      if (window.__LMF_STRENGTH_MAXES__?.get) return window.__LMF_STRENGTH_MAXES__.get()
      const raw = localStorage.getItem(MAXES_KEY); return raw ? JSON.parse(raw) : null
    } catch (_) { return null }
  }
  function lifts() {
    const state = maxState(); if (!state?.lifts) return []
    return Object.entries(state.lifts).map(([id,lift]) => ({id,...lift})).filter(x => x?.name)
  }
  function maxEvents() {
    const out = []
    for (const lift of lifts()) for (const item of Array.isArray(lift.history) ? lift.history : []) {
      const date = item?.date || item?.createdAt
      if (!item || !inRange(date)) continue
      out.push({id:item.id || `${lift.id}-${item.type}-${date}-${item.value}`,liftName:lift.name,type:item.type || 'max_update',value:item.value,unit:item.unit || lift.unit || 'lb',date,source:item.source || '',load:item.load,reps:item.reps,rpe:item.rpe})
    }
    return out.sort((a,b) => (asDate(b.date)?.getTime() || 0) - (asDate(a.date)?.getTime() || 0))
  }

  function scanObject(value, path, bucket, depth=0) {
    if (depth > 7 || value == null) return
    if (Array.isArray(value)) { value.slice(0,800).forEach((v,i) => scanObject(v,`${path}[${i}]`,bucket,depth+1)); return }
    if (typeof value !== 'object') return
    const lower = path.toLowerCase(); const keys = Object.keys(value)
    const date = value.completedAt || value.completed_at || value.date || value.createdAt || value.created_at || value.timestamp || value.loggedAt || value.logged_at
    const exercise = value.exercise || value.exerciseName || value.exercise_name || value.name || value.title || value.movement
    const program = value.program || value.programName || value.program_name
    const week = value.week || value.weekNumber || value.week_number
    const workoutLike = Boolean(date && (program || week || value.day || value.dayNumber || value.exercises || value.sets) && /workout|session|history|log|train/i.test(`${lower} ${keys.join(' ')}`))
    if (workoutLike) bucket.workouts.push({date,program,week,day:value.day || value.dayNumber || value.day_number})
    if (date && exercise && /sled|carry|farmer|suitcase|yoke|bike|rower|rowing|treadmill|conditioning|cardio|walk|run|assault|erg/i.test(String(exercise))) bucket.conditioning.push({date,name:String(exercise)})
    const bw = value.bodyWeight ?? value.bodyweight ?? value.body_weight ?? value.scaleWeight ?? value.scale_weight
    if (date && num(bw) > 50 && num(bw) < 700) bucket.body.push({date,value:num(bw),unit:value.weightUnit || value.weight_unit || value.unit || 'lb'})
    else if (date && /body|profile|weigh|check.?in/i.test(lower) && num(value.weight) > 50 && num(value.weight) < 700) bucket.body.push({date,value:num(value.weight),unit:value.weightUnit || value.weight_unit || value.unit || 'lb'})
    keys.slice(0,100).forEach(key => scanObject(value[key],`${path}.${key}`,bucket,depth+1))
  }

  function privateData(force=false) {
    const now = Date.now()
    if (!force && cache.data && cache.range === range && now - cache.at < 1800) return cache.data
    const bucket = {workouts:[],body:[],conditioning:[]}
    try {
      for (let i=0;i<localStorage.length;i+=1) {
        const key = localStorage.key(i)
        if (!key || [MAXES_KEY,TAB_KEY,RANGE_KEY].includes(key)) continue
        const raw = localStorage.getItem(key); if (!raw || raw.length > 3500000) continue
        try { scanObject(JSON.parse(raw),key,bucket) } catch (_) {}
      }
    } catch (_) {}
    const dedupe = (list,keyFn) => { const seen=new Set(); return list.filter(x => { const k=keyFn(x); if (seen.has(k)) return false; seen.add(k); return true }) }
    bucket.workouts = dedupe(bucket.workouts,x => `${day(x.date)}|${x.program || ''}|${x.week || ''}|${x.day || ''}`).filter(x => inRange(x.date)).sort((a,b)=>(asDate(b.date)?.getTime()||0)-(asDate(a.date)?.getTime()||0))
    bucket.body = dedupe(bucket.body,x => `${day(x.date)}|${x.value}|${x.unit}`).filter(x => inRange(x.date)).sort((a,b)=>(asDate(a.date)?.getTime()||0)-(asDate(b.date)?.getTime()||0))
    bucket.conditioning = dedupe(bucket.conditioning,x => `${day(x.date)}|${x.name}`).filter(x => inRange(x.date)).sort((a,b)=>(asDate(b.date)?.getTime()||0)-(asDate(a.date)?.getTime()||0))
    cache = {at:now,range,data:bucket}; return bucket
  }

  function isVisible(el) { if (!el?.isConnected) return false; const s=getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0 }
  function heading() { return [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent || '').trim()) && isVisible(el)) || null }
  function rootFor(h) { return h?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || h?.parentElement || null }
  function programContext(root) {
    const text=(root?.innerText || document.body.innerText || '').replace(/\s+/g,' ')
    return {program:text.match(/\b(Crownforge|Black Crown|Crown Maintenance)\b/i)?.[1] || '',week:text.match(/\bWeek\s+(\d{1,2})\b/i)?.[1] || ''}
  }

  function trend(lift) {
    const pts=(Array.isArray(lift.history)?lift.history:[]).filter(x => /estimate|e1rm/i.test(String(x.type || '')) && num(x.value)).sort((a,b)=>(asDate(a.date||a.createdAt)?.getTime()||0)-(asDate(b.date||b.createdAt)?.getTime()||0)).slice(-6)
    if (pts.length<2) return {dir:'flat',label:'No trend yet',points:[]}
    const first=num(pts[0].value),last=num(pts[pts.length-1].value),pct=first&&last?(last-first)/first:0
    return pct>=.015?{dir:'up',label:'Improving',points:pts}:pct<=-.015?{dir:'down',label:'Down recently',points:pts}:{dir:'flat',label:'Stable',points:pts}
  }
  function spark(points,w=220,h=58) {
    const values=points.map(x=>num(x.value)).filter(x=>x!=null)
    if(values.length<2) return '<div class="lmf-pg-empty-chart">More history needed</div>'
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min)
    const coords=values.map((v,i)=>`${(8+i*(w-16)/(values.length-1)).toFixed(1)},${(h-8-(v-min)*(h-16)/span).toFixed(1)}`).join(' ')
    return `<svg class="lmf-pg-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Performance trend"><polyline points="${coords}" fill="none" vector-effect="non-scaling-stroke"/></svg>`
  }
  function bodyChart(points) { return points.length<2?'<div class="lmf-pg-empty-chart is-large">Log at least two bodyweight entries to see a trend.</div>':spark(points.map(x=>({value:x.value})),520,130) }
  function summary(label,value,detail='') { return `<article class="lmf-pg-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>` }

  function milestone(rows) {
    for(const lift of rows){const actual=num(lift.actual1rm),est=num(lift.estimated1rm);if(actual&&est&&est>=actual*1.025)return `Review ${lift.name}: e1RM is above the current tested 1RM.`}
    const missing=rows.find(x=>!num(x.actual1rm));if(missing)return `Record a current tested 1RM for ${missing.name}.`
    const pr=rows.find(x=>!num(x.allTimePr));if(pr)return `Add the all-time PR for ${pr.name}.`
    return 'Keep building verified training history in the current program.'
  }
  function insight(rows,data) {
    const up=rows.map(lift=>({lift,t:trend(lift)})).find(x=>x.t.dir==='up');if(up)return `${up.lift.name} e1RM is trending upward across recent recorded estimates.`
    if(data.body.length>=2){const a=data.body[0],b=data.body[data.body.length-1],d=Math.round((b.value-a.value)*10)/10;if(d)return `Bodyweight changed ${d>0?'+':''}${d} ${b.unit||'lb'} in the selected range.`}
    if(data.conditioning.length)return `${data.conditioning.length} conditioning or carry exposure${data.conditioning.length===1?'':'s'} found in the selected range.`
    return 'More logged training history will unlock stronger trend and milestone insights.'
  }

  function overview(ctx,rows,data,events) {
    const body=data.body.at(-1),latest=data.workouts[0],program=ctx.program?`${ctx.program}${ctx.week?` · Week ${ctx.week}`:''}`:'Current program'
    return `<div class="lmf-pg-overview">
      <div class="lmf-pg-summary-grid">${summary('Current Program',program,ctx.week?'Active training phase':'Program context')}${summary('Logged Sessions',String(data.workouts.length),range==='all'?'All stored history':range==='7d'?'Last 7 days':'Last 30 days')}${summary('Bodyweight',body?`${body.value} ${body.unit}`:'—',body?dateLabel(body.date):'No entry found')}${summary('Recent Max Events',String(events.length),'PR / 1RM / e1RM history')}</div>
      <div class="lmf-pg-two-col"><article class="lmf-pg-panel"><span class="lmf-pg-kicker">PROGRAM MOMENTUM</span><h3>Training Snapshot</h3><div class="lmf-pg-momentum"><strong>${data.workouts.length}</strong><span>sessions in selected range</span></div><p>${latest?`Latest logged session: ${dateLabel(latest.date)}${latest.program?` · ${esc(latest.program)}`:''}.`:'No completed-session record was detected in the selected range.'}</p></article><article class="lmf-pg-panel insight"><span class="lmf-pg-kicker">COACH INSIGHT</span><h3>What the data says</h3><p>${esc(insight(rows,data))}</p><div class="lmf-pg-milestone"><small>NEXT MILESTONE</small><strong>${esc(milestone(rows))}</strong></div></article></div>
      <article class="lmf-pg-panel"><span class="lmf-pg-kicker">STRENGTH SNAPSHOT</span><h3>Main Lift Status</h3><div class="lmf-pg-strength-strip">${rows.slice(0,7).map(lift=>{const t=trend(lift);return `<span><b>${esc(lift.name)}</b><strong>${loadText(lift.estimated1rm||lift.actual1rm,lift.unit)}</strong><small class="is-${t.dir}">${t.dir==='up'?'↑':t.dir==='down'?'↓':'→'} ${esc(t.label)}</small></span>`}).join('')||'<div class="lmf-pg-empty compact">Add Strength Maxes to populate this snapshot.</div>'}</div></article>
      <div class="lmf-pg-two-col"><article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODYWEIGHT TREND</span><h3>Selected Range</h3>${bodyChart(data.body)}</article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">RECENT PRs</span><h3>Latest Strength Events</h3>${events.length?`<div class="lmf-pg-mini-feed">${events.slice(0,4).map(x=>`<div><span>${esc(x.liftName)}</span><b>${loadText(x.value,x.unit)}</b><small>${dateLabel(x.date)}</small></div>`).join('')}</div>`:'<div class="lmf-pg-empty compact">No max events in this range yet.</div>'}</article></div>
    </div>`
  }
  function strength(rows) {
    if(!rows.length)return '<div class="lmf-pg-empty">Strength Maxes are waiting for profile data.</div>'
    return `<div class="lmf-pg-lift-grid">${rows.map(lift=>{const t=trend(lift),recent=(Array.isArray(lift.history)?lift.history:[]).find(x=>x.load&&x.reps);return `<article class="lmf-pg-lift-card"><header><div><span>STRENGTH</span><h3>${esc(lift.name)}</h3></div><b class="is-${t.dir}">${t.dir==='up'?'↑':t.dir==='down'?'↓':'→'} ${esc(t.label)}</b></header><div class="lmf-pg-lift-metrics"><span><small>ACTUAL 1RM</small><strong>${loadText(lift.actual1rm,lift.unit)}</strong></span><span><small>e1RM</small><strong>${loadText(lift.estimated1rm,lift.unit)}</strong></span><span><small>ALL-TIME PR</small><strong>${loadText(lift.allTimePr,lift.unit)}</strong></span><span><small>LAST TESTED</small><strong>${lift.actualDate?dateLabel(lift.actualDate):'—'}</strong></span></div>${spark(t.points)}<footer>${recent?`Best estimate source: ${esc(`${recent.load} ${recent.unit||lift.unit||'lb'} × ${recent.reps}${recent.rpe?` @ RPE ${recent.rpe}`:''}`)}`:'Best recent set will appear as logged history becomes available.'}</footer></article>`}).join('')}</div>`
  }
  function bodyView(data) {
    const pts=data.body,current=pts.at(-1),first=pts[0],delta=current&&first?Math.round((current.value-first.value)*10)/10:null
    return `<div class="lmf-pg-body-stack"><div class="lmf-pg-summary-grid compact">${summary('Current Bodyweight',current?`${current.value} ${current.unit}`:'—',current?dateLabel(current.date):'No entry found')}${summary('Range Change',delta==null?'—':`${delta>0?'+':''}${delta} ${current?.unit||'lb'}`,pts.length>=2?`${pts.length} entries`:'Need 2+ entries')}${summary('Entries',String(pts.length),range==='all'?'All stored history':range==='7d'?'Last 7 days':'Last 30 days')}</div><article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODY TREND</span><h3>Bodyweight</h3>${bodyChart(pts)}</article></div>`
  }
  function conditioning(data) {
    const grouped=new Map();data.conditioning.forEach(x=>grouped.set(x.name,(grouped.get(x.name)||0)+1));const top=[...grouped.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
    return `<div class="lmf-pg-two-col"><article class="lmf-pg-panel"><span class="lmf-pg-kicker">WORK CAPACITY</span><h3>Conditioning Summary</h3><div class="lmf-pg-big-number">${data.conditioning.length}</div><p>Conditioning, sled, carry, cardio, or similar exposures detected in the selected range.</p></article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">ACTIVITY MIX</span><h3>Most Logged</h3>${top.length?`<ul class="lmf-pg-simple-list">${top.map(([name,count])=>`<li><span>${esc(name)}</span><b>${count}</b></li>`).join('')}</ul>`:'<div class="lmf-pg-empty compact">No conditioning entries detected yet.</div>'}</article></div>`
  }
  function prs(events) {
    if(!events.length)return '<div class="lmf-pg-empty">No strength-max PR or estimate events in this range yet.</div>'
    return `<div class="lmf-pg-feed">${events.slice(0,40).map(x=>{const label=/all_time_pr/i.test(x.type)?'ALL-TIME PR':/actual/i.test(x.type)?'ACTUAL 1RM':/estimate|e1rm/i.test(x.type)?'e1RM':'MAX UPDATE';const source=x.load&&x.reps?`${x.load} ${x.unit} × ${x.reps}${x.rpe?` @ RPE ${x.rpe}`:''}`:x.source;return `<article><div class="lmf-pg-pr-badge">${esc(label)}</div><div><h3>${esc(x.liftName)}</h3><strong>${loadText(x.value,x.unit)}</strong>${source?`<small>${esc(source)}</small>`:''}</div><time>${dateLabel(x.date)}</time></article>`}).join('')}</div>`
  }
  function tab(id,label){return `<button type="button" role="tab" data-pg-tab="${id}" aria-selected="${activeTab===id?'true':'false'}">${label}</button>`}

  function render() {
    const h=heading();if(!h)return
    const root=rootFor(h);if(!root)return
    const rows=lifts(),events=maxEvents(),data=privateData(),ctx=programContext(root)
    let el=document.getElementById(ROOT_ID)
    if(!el){el=document.createElement('section');el.id=ROOT_ID;el.className='lmf-progress-dashboard';h.insertAdjacentElement('afterend',el)}
    el.innerHTML=`<header class="lmf-pg-header"><div><span>ATHLETE PERFORMANCE</span><h2>PROGRESS DASHBOARD</h2><p>Verified training data first. Calculated values stay labeled and never rewrite programming.</p></div><select data-pg-range aria-label="Progress date range"><option value="7d" ${range==='7d'?'selected':''}>7 DAYS</option><option value="30d" ${range==='30d'?'selected':''}>30 DAYS</option><option value="all" ${range==='all'?'selected':''}>ALL TIME</option></select></header><nav class="lmf-pg-tabs" role="tablist" aria-label="Progress sections">${tab('overview','OVERVIEW')}${tab('strength','STRENGTH')}${tab('body','BODY')}${tab('conditioning','CONDITIONING')}${tab('prs','PRs')}</nav><div class="lmf-pg-tabbody" role="tabpanel" data-pg-panel="${activeTab}">${activeTab==='overview'?overview(ctx,rows,data,events):activeTab==='strength'?strength(rows):activeTab==='body'?bodyView(data):activeTab==='conditioning'?conditioning(data):prs(events)}</div>`
    const legacy=root.querySelector('#lmf-strength-maxes-progress');if(legacy)legacy.hidden=true
    el.querySelectorAll('[data-pg-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.pgTab;if(!TABS.includes(next)||next===activeTab)return;activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)}))
    el.querySelector('[data-pg-range]')?.addEventListener('change',event=>{const next=event.target.value;if(!RANGES.includes(next))return;range=next;writeSetting(RANGE_KEY,next);cache.at=0;queueRender(true)})
    window.__LMF_PROGRESS_DASHBOARD__={version:1,refresh:()=>queueRender(true),getTab:()=>activeTab,setTab:next=>{if(TABS.includes(next)){activeTab=next;writeSetting(TAB_KEY,next);queueRender(true)}}}
  }

  function queueRender(force=false){if(force)cache.at=0;clearTimeout(timer);timer=setTimeout(render,force?20:140)}
  function queueScan(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(heading())queueRender()})}
  function boot(){
    queueScan()
    new MutationObserver(records=>{const onlySelf=records.every(r=>r.target instanceof Element && r.target.closest(`#${ROOT_ID}`));if(!onlySelf)queueScan()}).observe(document.body,{childList:true,subtree:true})
    window.addEventListener('lmf:strength-maxes-updated',()=>queueRender(true))
    window.addEventListener('storage',event=>{if(!event.key||event.key===MAXES_KEY||/workout|history|readiness|profile|body|weight/i.test(event.key))queueRender(true)})
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueRender(true)})
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
})()
