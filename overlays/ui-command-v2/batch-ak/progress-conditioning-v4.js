(() => {
  'use strict'

  const ROOT_ID = 'lmf-progress-dashboard-v1'
  const DB_NAME = 'letmefly-private'
  const RANGE_KEY = 'letmefly_progress_dashboard_range_v1'
  const VERSION = 4
  const CONDITIONING_RE = /sled|carry|farmer|suitcase|yoke|bike|rower|rowing|treadmill|conditioning|cardio|walk|run|sprint|assault|erg|ski.?erg|gpp|work.?capacity|shuttle|interval|metcon|tempo|prowler|drag|stepmill|stair/i
  let timer = 0
  let busy = false

  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null }
  function date(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d }
  function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])) }
  function fmt(value, digits=1) { const n=num(value); if(n==null)return '—'; if(Number.isInteger(n))return new Intl.NumberFormat().format(n); return new Intl.NumberFormat(undefined,{maximumFractionDigits:digits}).format(n) }
  function normalize(value) { return String(value || '').toLowerCase().replace(/[–—]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }
  function dayKey(value) { const d=date(value); return d ? d.toISOString().slice(0,10) : '' }
  function dateLabel(value) { const d=date(value); if(!d)return '—'; try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d)}catch(_){return dayKey(value)||'—'} }
  function plural(n, word) { return `${n} ${word}${n===1?'':'s'}` }
  function parseObject(value) { if(value&&typeof value==='object')return value; if(typeof value!=='string')return null; try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:null}catch(_){return null} }

  function rangeName() { try { const value=localStorage.getItem(RANGE_KEY); return ['7d','30d','all'].includes(value)?value:'30d' } catch (_) { return '30d' } }
  function rangeSpec() {
    const key=rangeName(), now=new Date(); now.setHours(23,59,59,999)
    if(key==='all')return {key,currentStart:null,currentEnd:now,previousStart:null,previousEnd:null,label:'All stored history'}
    const days=key==='7d'?7:30
    const currentStart=new Date();currentStart.setHours(0,0,0,0);currentStart.setDate(currentStart.getDate()-(days-1))
    const previousEnd=new Date(currentStart.getTime()-1)
    const previousStart=new Date(currentStart);previousStart.setDate(previousStart.getDate()-days)
    return {key,days,currentStart,currentEnd:now,previousStart,previousEnd,label:key==='7d'?'Last 7 days':'Last 30 days'}
  }
  function inWindow(value,start,end) { const d=date(value); if(!d)return false; return (!start||d>=start)&&(!end||d<=end) }

  function request(req) { return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed'))}) }
  async function openDb() {
    if(!('indexedDB' in window))return null
    try{if(typeof indexedDB.databases==='function'){const dbs=await indexedDB.databases();if(!dbs.some(x=>x.name===DB_NAME))return null}}catch(_){}
    return new Promise(resolve=>{let req;try{req=indexedDB.open(DB_NAME)}catch(_){resolve(null);return}let upgrading=false;req.onupgradeneeded=()=>{upgrading=true;try{req.transaction.abort()}catch(_){}};req.onerror=()=>resolve(null);req.onsuccess=()=>{const db=req.result;if(upgrading||!db.objectStoreNames.contains('athletes')){try{db.close()}catch(_){}resolve(null);return}resolve(db)}})
  }
  async function rowsForAthlete(db,storeName,athleteId=null) {
    if(!db?.objectStoreNames.contains(storeName))return []
    try{
      const store=db.transaction(storeName,'readonly').objectStore(storeName)
      let rows
      if(athleteId&&store.indexNames.contains('by-athlete'))rows=await request(store.index('by-athlete').getAll(athleteId));else rows=await request(store.getAll())
      rows=(Array.isArray(rows)?rows:[]).filter(x=>x&&!x.deleted_at)
      if(!athleteId||store.indexNames.contains('by-athlete'))return rows
      return rows.filter(x=>{const owner=x.athlete_id??x.athleteId??x.athlete;return owner==null||owner===athleteId})
    }catch(_){return []}
  }
  async function privateData() {
    const db=await openDb();if(!db)return null
    try{
      const athletes=await rowsForAthlete(db,'athletes');if(!athletes.length)return null
      const athlete=[...athletes].sort((a,b)=>(date(b.updated_at||b.created_at)?.getTime()||0)-(date(a.updated_at||a.created_at)?.getTime()||0))[0]
      const id=athlete.id
      const [sessions,exercises,sets,records]=await Promise.all([
        rowsForAthlete(db,'workoutSessions',id),rowsForAthlete(db,'workoutExercises',id),rowsForAthlete(db,'workoutSets',id),rowsForAthlete(db,'personalRecords',id)
      ])
      return {athlete,sessions,exercises,sets,records}
    }finally{try{db.close()}catch(_){}}
  }

  function classify(name,category='') {
    const value=`${name} ${category}`.toLowerCase()
    if(/sled|prowler|drag/.test(value))return 'Sled / Drag'
    if(/carry|farmer|suitcase|yoke/.test(value))return 'Loaded Carry'
    if(/sprint|shuttle|\brun\b|treadmill/.test(value))return 'Running / Sprint'
    if(/bike|rower|rowing|assault|erg|stepmill|stair/.test(value))return 'Machine Conditioning'
    if(/interval|metcon|gpp|conditioning|work.?capacity|tempo/.test(value))return 'GPP / Intervals'
    return 'Conditioning'
  }
  function metricIn(source,names) {
    const root=parseObject(source);if(!root)return null
    const wanted=new Set(names.map(normalize)),stack=[root],seen=new Set()
    while(stack.length){const item=stack.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);for(const [key,value] of Object.entries(item)){if(wanted.has(normalize(key)))return {value,scope:item,key};const parsed=parseObject(value);if(parsed)stack.push(parsed)}}
    return null
  }
  function unitNear(scope,names) { if(!scope||typeof scope!=='object')return '';for(const name of names){for(const [key,value] of Object.entries(scope)){if(normalize(key)===normalize(name)&&value!=null)return String(value).toLowerCase()}}return '' }
  function parseDistance(source) {
    const hit=metricIn(source,['distance','distance_value','distanceValue','distance_meters','distance_yards','distance_feet','distance_km','distance_miles'])
    if(!hit)return null
    let value=hit.value, unit=''
    if(value&&typeof value==='object'){unit=String(value.unit||value.units||'').toLowerCase();value=value.value??value.amount??value.distance}
    if(typeof value==='string'){
      const m=value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(km|kilometers?|m|meters?|yd|yards?|ft|feet|mi|miles?)$/i)
      if(m){value=Number(m[1]);unit=m[2].toLowerCase()}else value=Number(value)
    }
    const n=num(value);if(n==null||n<=0)return null
    if(!unit)unit=unitNear(hit.scope,['distance_unit','distanceUnit','unit','units'])
    if(!unit){const key=normalize(hit.key);if(key.includes('meters'))unit='m';else if(key.includes('yards'))unit='yd';else if(key.includes('feet'))unit='ft';else if(key.includes('km'))unit='km';else if(key.includes('miles'))unit='mi'}
    const clean=/^kilometer/.test(unit)?'km':/^meter/.test(unit)?'m':/^yard/.test(unit)?'yd':/^feet|^foot/.test(unit)?'ft':/^mile/.test(unit)?'mi':unit
    const meters=clean==='km'?n*1000:clean==='m'?n:clean==='yd'?n*.9144:clean==='ft'?n*.3048:clean==='mi'?n*1609.344:null
    return clean&&meters!=null?{value:n,unit:clean,meters}:null
  }
  function parseDuration(source) {
    const specific=[['duration_seconds','s'],['durationSeconds','s'],['time_seconds','s'],['timeSeconds','s'],['duration_minutes','min'],['durationMinutes','min'],['time_minutes','min'],['timeMinutes','min']]
    for(const [key,unit] of specific){const hit=metricIn(source,[key]);const n=num(hit?.value);if(n!=null&&n>0)return {seconds:unit==='min'?n*60:n}}
    const hit=metricIn(source,['duration','time','elapsed','elapsed_time']);if(!hit)return null
    let value=hit.value,unit=''
    if(value&&typeof value==='object'){unit=String(value.unit||value.units||'').toLowerCase();value=value.value??value.amount??value.time??value.duration}
    if(typeof value==='string'){
      const text=value.trim();const clock=text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
      if(clock)return {seconds:(Number(clock[1]||0)*3600)+(Number(clock[2])*60)+Number(clock[3])}
      const simple=text.match(/^(-?\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)$/i)
      if(simple){value=Number(simple[1]);unit=simple[2].toLowerCase()}else value=Number(value)
    }
    const n=num(value);if(n==null||n<=0)return null
    if(!unit)unit=unitNear(hit.scope,['duration_unit','time_unit','unit','units'])
    if(/^h/.test(unit))return {seconds:n*3600};if(/^m(?!s)/.test(unit))return {seconds:n*60};if(/^s/.test(unit))return {seconds:n}
    return null
  }
  function parseRounds(source) { const hit=metricIn(source,['rounds','rounds_completed','completed_rounds']);const n=num(hit?.value);return n!=null&&n>0?n:null }
  function performanceSources(set,exercise) { return [parseObject(set?.performance_data),parseObject(set?.performance),parseObject(set?.result),set,parseObject(exercise?.performance_data),parseObject(exercise?.performance)].filter(Boolean) }
  function firstMetric(sources,parser) { for(const source of sources){const value=parser(source);if(value!=null)return value}return null }
  function targetText(exercise) {
    const snap=parseObject(exercise?.prescription_snapshot);if(!snap)return ''
    const d=parseDistance(snap),t=parseDuration(snap),r=parseRounds(snap)
    const parts=[];if(d)parts.push(`${fmt(d.value)} ${d.unit}`);if(t)parts.push(formatDuration(t.seconds));if(r)parts.push(`${fmt(r)} rounds`)
    return parts.length?parts.join(' · '):''
  }
  function activityRows(data) {
    const sessionMap=new Map(data.sessions.map(x=>[x.id,x])),setsByExercise=new Map()
    for(const set of data.sets){if(!setsByExercise.has(set.workout_exercise_id))setsByExercise.set(set.workout_exercise_id,[]);setsByExercise.get(set.workout_exercise_id).push(set)}
    const rows=[]
    for(const exercise of data.exercises){
      const name=String(exercise.exercise_name_snapshot||exercise.exercise_key||'Conditioning'),category=String(exercise.prescription_snapshot?.category||exercise.category||'')
      if(!CONDITIONING_RE.test(`${name} ${category}`))continue
      const session=sessionMap.get(exercise.workout_session_id),sets=(setsByExercise.get(exercise.id)||[]).filter(x=>x.completed===true)
      const completedSession=Boolean(session?.completed_at||session?.status==='completed')
      if(!completedSession&&!sets.length)continue
      const when=session?.completed_at||sets.map(x=>x.completed_at).filter(Boolean).sort().at(-1)||session?.started_at||exercise.updated_at||exercise.created_at
      if(!when)continue
      const loads=sets.map(x=>({value:num(x.load_value),unit:String(x.load_unit||data.athlete?.default_weight_unit||'lb').toLowerCase()==='kg'?'kg':'lb'})).filter(x=>x.value!=null&&x.value>0)
      const reps=sets.map(x=>num(x.reps)).filter(x=>x!=null&&x>0),rpes=sets.map(x=>num(x.rpe)).filter(x=>x!=null&&x>0)
      const distances=[],durations=[],rounds=[]
      for(const set of sets){const sources=performanceSources(set,exercise),d=firstMetric(sources,parseDistance),t=firstMetric(sources,parseDuration),r=firstMetric(sources,parseRounds);if(d)distances.push(d);if(t)durations.push(t);if(r)rounds.push(r)}
      if(!sets.length){const sources=performanceSources(null,exercise),d=firstMetric(sources,parseDistance),t=firstMetric(sources,parseDuration),r=firstMetric(sources,parseRounds);if(d)distances.push(d);if(t)durations.push(t);if(r)rounds.push(r)}
      rows.push({id:exercise.id,name,category,type:classify(name,category),date:when,sessionId:exercise.workout_session_id,sets:sets.length,loads,reps:reps.reduce((a,b)=>a+b,0),avgRpe:rpes.length?rpes.reduce((a,b)=>a+b,0)/rpes.length:null,distances,durations,rounds,target:targetText(exercise)})
    }
    return rows.sort((a,b)=>(date(b.date)?.getTime()||0)-(date(a.date)?.getTime()||0))
  }

  function distanceText(distances) {
    if(!distances.length)return ''
    const units=new Set(distances.map(x=>x.unit));if(units.size===1){const unit=distances[0].unit;return `${fmt(distances.reduce((sum,x)=>sum+x.value,0))} ${unit}`}
    const meters=distances.reduce((sum,x)=>sum+x.meters,0);return meters>=1000?`${fmt(meters/1000,2)} km`:`${fmt(meters)} m`
  }
  function formatDuration(seconds) { const n=Math.max(0,Math.round(num(seconds)||0));if(!n)return '';if(n<60)return `${n}s`;const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;if(h)return `${h}h ${m}m`;return s?`${m}m ${s}s`:`${m} min` }
  function activityPerformance(row) {
    const parts=[],distance=distanceText(row.distances),seconds=row.durations.reduce((sum,x)=>sum+x.seconds,0),rounds=row.rounds.reduce((sum,x)=>sum+x,0)
    if(distance)parts.push(distance);if(seconds)parts.push(formatDuration(seconds));if(rounds)parts.push(`${fmt(rounds)} rounds`)
    return parts.join(' · ')
  }
  function topLoad(row) { if(!row.loads.length)return null;const units=[...new Set(row.loads.map(x=>x.unit))];for(const unit of units){const values=row.loads.filter(x=>x.unit===unit).map(x=>x.value);if(values.length)return {value:Math.max(...values),unit}}return null }
  function summary(rows) {
    const sessions=new Set(rows.map(x=>x.sessionId).filter(Boolean)),days=new Set(rows.map(x=>dayKey(x.date)).filter(Boolean)),completedSets=rows.reduce((n,x)=>n+x.sets,0)
    const loads=rows.flatMap(x=>x.loads),measured=rows.filter(x=>x.distances.length||x.durations.length||x.rounds.length)
    const rpes=rows.map(x=>x.avgRpe).filter(x=>x!=null),seconds=rows.flatMap(x=>x.durations).reduce((n,x)=>n+x.seconds,0)
    const heaviestByUnit={};for(const item of loads)heaviestByUnit[item.unit]=Math.max(heaviestByUnit[item.unit]||0,item.value)
    return {sessions:sessions.size,days:days.size,exposures:rows.length,completedSets,loadedSets:loads.length,measured:measured.length,avgRpe:rpes.length?rpes.reduce((a,b)=>a+b,0)/rpes.length:null,seconds,heaviestByUnit}
  }
  function groupRows(rows) {
    const map=new Map()
    for(const row of rows){const key=normalize(row.name)||row.name;let item=map.get(key);if(!item){item={name:row.name,type:row.type,rows:[],sessions:new Set(),sets:0,last:null};map.set(key,item)}item.rows.push(row);if(row.sessionId)item.sessions.add(row.sessionId);item.sets+=row.sets;if(!item.last||(date(row.date)?.getTime()||0)>(date(item.last)?.getTime()||0))item.last=row.date}
    return [...map.values()].sort((a,b)=>b.sessions.size-a.sessions.size||b.rows.length-a.rows.length||(date(b.last)?.getTime()||0)-(date(a.last)?.getTime()||0))
  }
  function frequencyTrend(current,previous,spec) {
    if(spec.key==='all')return {label:`${plural(current.days,'active day')} across stored history`,tone:'flat',detail:'Frequency is descriptive, not a programming grade.'}
    if(!previous.sessions&&current.sessions)return {label:'Building recent history',tone:'up',detail:`${plural(current.sessions,'session')} now · none in the prior ${spec.days} days`}
    if(!previous.sessions&&!current.sessions)return {label:'No recent comparison yet',tone:'flat',detail:`No conditioning sessions in either ${spec.days}-day window.`}
    const delta=current.sessions-previous.sessions,tone=delta>0?'up':delta<0?'down':'flat'
    return {label:delta>0?'More activity logged':delta<0?'Less activity logged':'Same session frequency',tone,detail:`${current.sessions} vs ${previous.sessions} session${previous.sessions===1?'':'s'} in the prior ${spec.days} days`}
  }
  function metricCard(label,value,detail='') { return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>` }
  function storedRecordRows(records,spec) {
    return records.map(record=>{
      const name=String(record.exercise_name||record.exercise_name_snapshot||record.exercise_key||record.name||'')
      if(!CONDITIONING_RE.test(`${name} ${record.pr_type||''}`))return null
      const when=record.achieved_at||record.created_at||record.updated_at;if(!inWindow(when,spec.currentStart,spec.currentEnd))return null
      const perf=parseObject(record.performance)||parseObject(record.performance_data)||record
      const d=parseDistance(perf),t=parseDuration(perf),r=parseRounds(perf),load=num(perf.load??perf.weight??record.value),unit=String(perf.load_unit||perf.weight_unit||record.unit||'').toLowerCase()
      const parts=[];if(d)parts.push(`${fmt(d.value)} ${d.unit}`);if(t)parts.push(formatDuration(t.seconds));if(r)parts.push(`${fmt(r)} rounds`);if(load&&/^(lb|kg)$/.test(unit))parts.push(`${fmt(load)} ${unit}`)
      return parts.length?{name:name.replace(/-/g,' '),type:String(record.pr_type||'Performance record').replace(/[_-]+/g,' '),date:when,display:parts.join(' · ')}:null
    }).filter(Boolean).sort((a,b)=>(date(b.date)?.getTime()||0)-(date(a.date)?.getTime()||0))
  }
  function coachRead(current,previous,groups,spec) {
    if(!current.exposures)return 'No completed conditioning work is available in this range yet. LetMeFly will build the analysis from completed carries, sleds, intervals, running, machines, and GPP work as it is logged.'
    const top=groups[0],trend=frequencyTrend(current,previous,spec),measured=current.measured?`${current.measured} of ${current.exposures} exposures include measured distance, time, or rounds.`:'Load, sets, and RPE are available, but no achieved distance, time, or round metric is stored in this range.'
    return `${top?`${top.name} is the most frequent mode (${plural(top.sessions.size,'session')}). `:''}${trend.label}. ${measured} More logged work is not automatically better; frequency is shown as context, not a reason to rewrite the program.`
  }
  function milestone(current,groups) {
    if(!current.exposures)return 'Complete a programmed conditioning block to establish the first work-capacity data point.'
    const top=groups[0];if(!top)return 'Keep completing the programmed conditioning work so comparable history can build.'
    const measured=top.rows.filter(x=>x.distances.length||x.durations.length||x.rounds.length)
    if(measured.length>=2)return `${top.name} now has ${measured.length} measured exposures. LetMeFly can use future comparable records to identify real distance, time, or round PRs without changing programming.`
    if(top.sessions.size>=2)return `${top.name} has ${top.sessions.size} completed sessions. A second measured distance, time, or round result will make the trend more useful than load alone.`
    return `One ${top.name} session is logged. The next comparable completed exposure will start a meaningful history for this mode.`
  }
  function rowDetail(row) {
    const parts=[];if(row.sets)parts.push(plural(row.sets,'completed set'));const load=topLoad(row);if(load)parts.push(`top ${fmt(load.value)} ${load.unit}`);if(row.avgRpe!=null)parts.push(`avg RPE ${fmt(row.avgRpe)}`);const perf=activityPerformance(row);if(perf)parts.push(perf);return parts.join(' · ')||'Completed conditioning exposure'
  }
  function modeDetail(group) {
    const rows=group.rows,loads=rows.map(topLoad).filter(Boolean),rpes=rows.map(x=>x.avgRpe).filter(x=>x!=null),measured=rows.map(activityPerformance).filter(Boolean)
    const parts=[plural(group.sessions.size,'session'),plural(group.sets,'set')]
    if(loads.length){const best=loads.sort((a,b)=>b.value-a.value)[0];parts.push(`top ${fmt(best.value)} ${best.unit}`)}
    if(rpes.length)parts.push(`avg RPE ${fmt(rpes.reduce((a,b)=>a+b,0)/rpes.length)}`)
    if(measured.length)parts.push(`${measured.length} measured`)
    return parts.join(' · ')
  }

  function renderConditioning(body,data) {
    const spec=rangeSpec(),all=activityRows(data),currentRows=all.filter(x=>inWindow(x.date,spec.currentStart,spec.currentEnd)),previousRows=spec.previousStart?all.filter(x=>inWindow(x.date,spec.previousStart,spec.previousEnd)):[]
    const current=summary(currentRows),previous=summary(previousRows),groups=groupRows(currentRows),trend=frequencyTrend(current,previous,spec),records=storedRecordRows(data.records,spec)
    const signature=[spec.key,current.exposures,current.completedSets,current.loadedSets,current.measured,current.sessions,currentRows[0]?.date||'',records.length].join('|')
    if(body.dataset.conditioningV4===String(VERSION)&&body.dataset.conditioningSignature===signature)return
    const heaviest=Object.entries(current.heaviestByUnit).sort((a,b)=>b[1]-a[1])[0]
    const dynamicThird=current.seconds?metricCard('TRACKED TIME',formatDuration(current.seconds),`${current.measured} measured exposure${current.measured===1?'':'s'}`):metricCard('LOADED SETS',String(current.loadedSets),heaviest?`heaviest ${fmt(heaviest[1])} ${heaviest[0]}`:'No load stored')
    const dynamicFourth=current.measured?metricCard('MEASURED WORK',String(current.measured),'distance · time · rounds'):metricCard('ACTIVE DAYS',String(current.days),spec.label)
    const metrics=`<div class="lmf-pg-conditioning-metrics lmf-pg-conditioning-v4-metrics">${metricCard('CONDITIONING SESSIONS',String(current.sessions),spec.label)}${metricCard('COMPLETED SETS',String(current.completedSets),`${current.exposures} detected exposure${current.exposures===1?'':'s'}`)}${dynamicThird}${dynamicFourth}</div>`
    const empty=`<article class="lmf-pg-panel lmf-pg-conditioning-v4-empty"><span class="lmf-pg-kicker">WORK CAPACITY</span><h3>Conditioning history starts here</h3><p>Complete programmed sleds, carries, intervals, sprints, bike/row work, or GPP blocks and LetMeFly will build frequency, workload, and measured-performance history automatically.</p><small>Only completed private workout data is analyzed. Program prescriptions are never changed from this screen.</small></article>`
    const modeList=groups.length?`<div class="lmf-pg-conditioning-mode-list">${groups.slice(0,8).map(group=>`<article><div><span>${esc(group.type)}</span><strong>${esc(group.name)}</strong><small>${esc(modeDetail(group))}</small></div><time>${esc(dateLabel(group.last))}</time></article>`).join('')}</div>`:'<div class="lmf-pg-empty compact">No completed conditioning modes in this range.</div>'
    const recent=currentRows.length?`<article class="lmf-pg-panel lmf-pg-conditioning-recent-v4"><span class="lmf-pg-kicker">RECENT WORK</span><h3>Latest Completed Conditioning</h3><div>${currentRows.slice(0,8).map(row=>`<span><b>${esc(row.name)}</b><small>${esc(rowDetail(row))}${row.target?`<i>Program target: ${esc(row.target)}</i>`:''}</small><time>${esc(dateLabel(row.date))}</time></span>`).join('')}</div></article>`:''
    const recordPanel=records.length?`<article class="lmf-pg-panel lmf-pg-conditioning-records"><span class="lmf-pg-kicker">STORED PERFORMANCE RECORDS</span><h3>Conditioning PR Evidence</h3><div>${records.slice(0,6).map(record=>`<span><b>${esc(record.name)}</b><small>${esc(record.type)}</small><strong>${esc(record.display)}</strong><time>${esc(dateLabel(record.date))}</time></span>`).join('')}</div></article>`:`<article class="lmf-pg-panel lmf-pg-conditioning-records is-empty"><span class="lmf-pg-kicker">STORED PERFORMANCE RECORDS</span><h3>Conditioning PR Evidence</h3><p>No distance/time/round conditioning PR record is stored in this range yet. LetMeFly will show one here when the workout logger or PR system records it.</p></article>`
    body.innerHTML=`<div class="lmf-pg-conditioning-v4" data-conditioning-v4="${VERSION}">${metrics}${current.exposures?`<div class="lmf-pg-conditioning-v4-grid"><article class="lmf-pg-panel lmf-pg-conditioning-coach"><span class="lmf-pg-kicker">COACH READ</span><h3>Work-Capacity Context</h3><p>${esc(coachRead(current,previous,groups,spec))}</p><div class="lmf-pg-conditioning-trend is-${trend.tone}"><span>${esc(trend.label)}</span><small>${esc(trend.detail)}</small></div><div class="lmf-pg-conditioning-milestone"><small>NEXT MEASURABLE MILESTONE</small><strong>${esc(milestone(current,groups))}</strong></div></article><article class="lmf-pg-panel"><span class="lmf-pg-kicker">ACTIVITY MIX</span><h3>Most Logged Modes</h3>${modeList}</article></div>${recent}<div class="lmf-pg-conditioning-v4-grid records">${recordPanel}<article class="lmf-pg-panel lmf-pg-conditioning-rules"><span class="lmf-pg-kicker">HOW TO READ THIS</span><h3>Workload vs. Performance</h3><p><b>Sets, load, reps, and RPE</b> describe workload. <b>Distance, time, and rounds</b> are treated as measured performance only when they are stored as achieved results. Program targets stay labeled as targets and are never counted as completed performance.</p></article></div>`:empty}</div>`
    body.dataset.conditioningV4=String(VERSION);body.dataset.conditioningSignature=signature
    window.__LMF_PROGRESS_CONDITIONING__={version:VERSION,range:spec.key,summary:{...current},refresh:()=>schedule(0)}
  }

  async function enhance() {
    const root=document.getElementById(ROOT_ID),body=root?.querySelector('[data-pg-panel="conditioning"]');if(!root||!body||busy)return
    busy=true
    try{const data=await privateData();if(!data)return;renderConditioning(body,data);root.dataset.conditioningAnalytics='4'}catch(error){console.warn('LetMeFly Conditioning analytics skipped',error)}finally{busy=false}
  }
  function schedule(delay=70){clearTimeout(timer);timer=setTimeout(()=>void enhance(),delay)}
  function boot(){schedule(0);new MutationObserver(records=>{if(records.some(record=>record.target instanceof Element&&record.target.closest?.(`#${ROOT_ID}`)))schedule()}).observe(document.body,{childList:true,subtree:true});window.addEventListener('hashchange',()=>schedule(80));document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(40)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
})()
