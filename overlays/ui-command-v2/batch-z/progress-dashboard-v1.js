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
  let scanQueued = false
  let renderTimer = 0

  function readSetting(key, fallback, allowed) {
    try {
      const value = localStorage.getItem(key)
      return allowed.includes(value) ? value : fallback
    } catch (_) { return fallback }
  }

  function writeSetting(key, value) {
    try { localStorage.setItem(key, value) } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]))
  }

  function n(value) {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  function dateValue(value) {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  function isoDay(value) {
    const d = dateValue(value)
    return d ? d.toISOString().slice(0, 10) : ''
  }

  function shortDate(value) {
    const d = dateValue(value)
    if (!d) return '—'
    try { return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(d) }
    catch (_) { return isoDay(value) || '—' }
  }

  function rangeCutoff() {
    if (range === 'all') return null
    const days = range === '7d' ? 7 : 30
    const cutoff = new Date()
    cutoff.setHours(0,0,0,0)
    cutoff.setDate(cutoff.getDate() - (days - 1))
    return cutoff
  }

  function inRange(value) {
    const cutoff = rangeCutoff()
    if (!cutoff) return true
    const d = dateValue(value)
    return d ? d >= cutoff : false
  }

  function maxesState() {
    try {
      if (window.__LMF_STRENGTH_MAXES__?.get) return window.__LMF_STRENGTH_MAXES__.get()
      const raw = localStorage.getItem(MAXES_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (_) { return null }
  }

  function liftRows() {
    const state = maxesState()
    if (!state?.lifts) return []
    return Object.entries(state.lifts).map(([id, lift]) => ({ id, ...lift })).filter(x => x?.name)
  }

  function historyEvents() {
    const out = []
    for (const lift of liftRows()) {
      for (const item of Array.isArray(lift.history) ? lift.history : []) {
        if (!item || !inRange(item.date || item.createdAt)) continue
        out.push({
          id: item.id || `${lift.id}-${item.type}-${item.date}-${item.value}`,
          liftId: lift.id,
          liftName: lift.name,
          type: item.type || 'max_update',
          value: item.value,
          unit: item.unit || lift.unit || 'lb',
          date: item.date || item.createdAt,
          source: item.source || '',
          load: item.load,
          reps: item.reps,
          rpe: item.rpe,
        })
      }
    }
    return out.sort((a,b) => (dateValue(b.date)?.getTime() || 0) - (dateValue(a.date)?.getTime() || 0))
  }

  function walkJson(value, path, bucket, depth = 0) {
    if (depth > 7 || value == null) return
    if (Array.isArray(value)) {
      value.slice(0, 800).forEach((item, index) => walkJson(item, `${path}[${index}]`, bucket, depth + 1))
      return
    }
    if (typeof value !== 'object') return

    const lowerPath = path.toLowerCase()
    const keys = Object.keys(value)
    const date = value.completedAt || value.completed_at || value.date || value.createdAt || value.created_at || value.timestamp || value.loggedAt || value.logged_at
    const exercise = value.exercise || value.exerciseName || value.exercise_name || value.name || value.title || value.movement
    const program = value.program || value.programName || value.program_name
    const week = value.week || value.weekNumber || value.week_number
    const day = value.day || value.dayNumber || value.day_number

    const isWorkoutish = Boolean(date && (program || week || day || value.exercises || value.sets) && /workout|session|history|log|train/i.test(`${lowerPath} ${keys.join(' ')}`))
    if (isWorkoutish) bucket.workouts.push({ date, program, week, day, exercise, raw:value })

    if (date && exercise && /sled|carry|farmer|suitcase|yoke|bike|rower|rowing|treadmill|conditioning|cardio|walk|run|assault|erg/i.test(String(exercise))) {
      bucket.conditioning.push({ date, name:String(exercise), raw:value })
    }

    const bw = value.bodyWeight ?? value.bodyweight ?? value.body_weight ?? value.scaleWeight ?? value.scale_weight
    if (date && n(bw) && n(bw) > 50 && n(bw) < 700) bucket.body.push({ date, value:n(bw), unit:value.weightUnit || value.weight_unit || value.unit || 'lb' })
    else if (date && /body|profile|weigh|check.?in/i.test(lowerPath)) {
      const weight = n(value.weight)
      if (weight && weight > 50 && weight < 700) bucket.body.push({ date, value:weight, unit:value.weightUnit || value.weight_unit || value.unit || 'lb' })
    }

    keys.slice(0, 100).forEach(key => walkJson(value[key], `${path}.${key}`, bucket, depth + 1))
  }

  function privateDataSnapshot() {
    const bucket = { workouts:[], body:[], conditioning:[] }
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key || key === MAXES_KEY || key === TAB_KEY || key === RANGE_KEY) continue
        const raw = localStorage.getItem(key)
        if (!raw || raw.length > 3500000) continue
        let parsed
        try { parsed = JSON.parse(raw) } catch (_) { continue }
        walkJson(parsed, key, bucket)
      }
    } catch (_) {}

    function dedupe(list, keyFn) {
      const seen = new Set()
      return list.filter(item => {
        const key = keyFn(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    bucket.workouts = dedupe(bucket.workouts, x => `${isoDay(x.date)}|${x.program || ''}|${x.week || ''}|${x.day || ''}`).filter(x => inRange(x.date))
      .sort((a,b) => (dateValue(b.date)?.getTime() || 0) - (dateValue(a.date)?.getTime() || 0))
    bucket.body = dedupe(bucket.body, x => `${isoDay(x.date)}|${x.value}|${x.unit}`).filter(x => inRange(x.date))
      .sort((a,b) => (dateValue(a.date)?.getTime() || 0) - (dateValue(b.date)?.getTime() || 0))
    bucket.conditioning = dedupe(bucket.conditioning, x => `${isoDay(x.date)}|${x.name}`).filter(x => inRange(x.date))
      .sort((a,b) => (dateValue(b.date)?.getTime() || 0) - (dateValue(a.date)?.getTime() || 0))
    return bucket
  }

  function visibleProgressHeading() {
    return [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent || '').trim()) && isVisible(el)) || null
  }

  function isVisible(el) {
    if (!el?.isConnected) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0
  }

  function progressRoot(heading) {
    return heading?.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || heading?.parentElement || null
  }

  function programContext(root) {
    const text = (root?.innerText || document.body.innerText || '').replace(/\s+/g, ' ')
    const program = text.match(/\b(Crownforge|Black Crown|Crown Maintenance)\b/i)?.[1] || ''
    const week = text.match(/\bWeek\s+(\d{1,2})\b/i)?.[1] || ''
    return { program, week }
  }

  function loadText(value, unit = 'lb') {
    const num = n(value)
    return num && num > 0 ? `${num} ${unit || 'lb'}` : '—'
  }

  function trendForLift(lift) {
    const points = (Array.isArray(lift.history) ? lift.history : [])
      .filter(x => /estimate|e1rm/i.test(String(x.type || '')) && n(x.value))
      .sort((a,b) => (dateValue(a.date || a.createdAt)?.getTime() || 0) - (dateValue(b.date || b.createdAt)?.getTime() || 0))
    if (points.length < 2) return { label:'No trend yet', dir:'flat', points:[] }
    const recent = points.slice(-6)
    const first = n(recent[0].value)
    const last = n(recent[recent.length - 1].value)
    if (!first || !last) return { label:'No trend yet', dir:'flat', points:recent }
    const pct = (last - first) / first
    if (pct >= .015) return { label:'Improving', dir:'up', points:recent }
    if (pct <= -.015) return { label:'Down recently', dir:'down', points:recent }
    return { label:'Stable', dir:'flat', points:recent }
  }

  function sparkline(points, width = 220, height = 58) {
    const vals = points.map(x => n(x.value)).filter(v => v != null)
    if (vals.length < 2) return '<div class="lmf-pg-empty-chart">More history needed</div>'
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = Math.max(1, max - min)
    const coords = vals.map((v,i) => {
      const x = 8 + (i * (width - 16) / (vals.length - 1))
      const y = height - 8 - ((v - min) * (height - 16) / span)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return `<svg class="lmf-pg-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Performance trend"><polyline points="${coords}" fill="none" vector-effect="non-scaling-stroke"/></svg>`
  }

  function bodyChart(points) {
    if (points.length < 2) return '<div class="lmf-pg-empty-chart is-large">Log at least two bodyweight entries to see a trend.</div>'
    return sparkline(points.map(x => ({ value:x.value })), 520, 130)
  }

  function milestone(lifts) {
    for (const lift of lifts) {
      const actual = n(lift.actual1rm)
      const est = n(lift.estimated1rm)
      if (actual && est && est >= actual * 1.025) return `Review ${lift.name}: e1RM is above the current tested 1RM.`
    }
    const missingActual = lifts.find(lift => !n(lift.actual1rm))
    if (missingActual) return `Record a current tested 1RM for ${missingActual.name}.`
    const missingPr = lifts.find(lift => !n(lift.allTimePr))
    if (missingPr) return `Add the all-time PR for ${missingPr.name}.`
    return 'Keep building verified training history in the current program.'
  }

  function coachInsight(lifts, data) {
    const improving = lifts.map(lift => ({ lift, trend:trendForLift(lift) })).find(x => x.trend.dir === 'up')
    if (improving) return `${improving.lift.name} e1RM is trending upward across recent recorded estimates.`
    if (data.body.length >= 2) {
      const first = data.body[0].value
      const last = data.body[data.body.length - 1].value
      const delta = Math.round((last - first) * 10) / 10
      if (delta !== 0) return `Bodyweight changed ${delta > 0 ? '+' : ''}${delta} ${data.body[data.body.length - 1].unit || 'lb'} in the selected range.`
    }
    if (data.conditioning.length) return `${data.conditioning.length} conditioning or carry exposure${data.conditioning.length === 1 ? '' : 's'} found in the selected range.`
    return 'More logged training history will unlock stronger trend and milestone insights.'
  }

  function summaryCard(label, value, detail = '') {
    return `<article class="lmf-pg-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</article>`
  }

  function strengthCards(lifts) {
    if (!lifts.length) return '<div class="lmf-pg-empty">Strength Maxes are waiting for profile data.</div>'
    return `<div class="lmf-pg-lift-grid">${lifts.map(lift => {
      const trend = trendForLift(lift)
      const recent = Array.isArray(lift.history) ? lift.history.find(x => x.load && x.reps) : null
      return `<article class="lmf-pg-lift-card">
        <header><div><span>STRENGTH</span><h3>${escapeHtml(lift.name)}</h3></div><b class="is-${trend.dir}">${trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} ${escapeHtml(trend.label)}</b></header>
        <div class="lmf-pg-lift-metrics">
          <span><small>ACTUAL 1RM</small><strong>${loadText(lift.actual1rm, lift.unit)}</strong></span>
          <span><small>e1RM</small><strong>${loadText(lift.estimated1rm, lift.unit)}</strong></span>
          <span><small>ALL-TIME PR</small><strong>${loadText(lift.allTimePr, lift.unit)}</strong></span>
          <span><small>LAST TESTED</small><strong>${lift.actualDate ? shortDate(lift.actualDate) : '—'}</strong></span>
        </div>
        ${sparkline(trend.points)}
        <footer>${recent ? `Best estimate source: ${escapeHtml(`${recent.load} ${recent.unit || lift.unit || 'lb'} × ${recent.reps}${recent.rpe ? ` @ RPE ${recent.rpe}` : ''}`)}` : 'Best recent set will appear as logged history becomes available.'}</footer>
      </article>`
    }).join('')}</div>`
  }

  function prFeed(events) {
    if (!events.length) return '<div class="lmf-pg-empty">No strength-max PR or estimate events in this range yet.</div>'
    return `<div class="lmf-pg-feed">${events.slice(0, 40).map(event => {
      const label = /all_time_pr/i.test(event.type) ? 'ALL-TIME PR' : /actual/i.test(event.type) ? 'ACTUAL 1RM' : /estimate|e1rm/i.test(event.type) ? 'e1RM' : 'MAX UPDATE'
      const source = event.load && event.reps ? `${event.load} ${event.unit} × ${event.reps}${event.rpe ? ` @ RPE ${event.rpe}` : ''}` : event.source
      return `<article><div class="lmf-pg-pr-badge">${escapeHtml(label)}</div><div><h3>${escapeHtml(event.liftName)}</h3><strong>${loadText(event.value, event.unit)}</strong>${source ? `<small>${escapeHtml(source)}</small>` : ''}</div><time>${shortDate(event.date)}</time></article>`
    }).join('')}</div>`
  }

  function conditioningView(data) {
    const grouped = new Map()
    data.conditioning.forEach(item => grouped.set(item.name, (grouped.get(item.name) || 0) + 1))
    const top = [...grouped.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8)
    return `<div class="lmf-pg-two-col">
      <article class="lmf-pg-panel"><span class="lmf-pg-kicker">WORK CAPACITY</span><h3>Conditioning Summary</h3><div class="lmf-pg-big-number">${data.conditioning.length}</div><p>Conditioning, sled, carry, cardio, or similar exposures detected in the selected range.</p></article>
      <article class="lmf-pg-panel"><span class="lmf-pg-kicker">ACTIVITY MIX</span><h3>Most Logged</h3>${top.length ? `<ul class="lmf-pg-simple-list">${top.map(([name,count]) => `<li><span>${escapeHtml(name)}</span><b>${count}</b></li>`).join('')}</ul>` : '<div class="lmf-pg-empty compact">No conditioning entries detected yet.</div>'}</article>
    </div>`
  }

  function bodyView(data) {
    const points = data.body
    const current = points.length ? points[points.length - 1] : null
    const first = points.length ? points[0] : null
    const delta = current && first ? Math.round((current.value - first.value) * 10) / 10 : null
    return `<div class="lmf-pg-body-stack">
      <div class="lmf-pg-summary-grid compact">
        ${summaryCard('Current Bodyweight', current ? `${current.value} ${current.unit}` : '—', current ? shortDate(current.date) : 'No entry found')}
        ${summaryCard('Range Change', delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} ${current?.unit || 'lb'}`, points.length >= 2 ? `${points.length} entries` : 'Need 2+ entries')}
        ${summaryCard('Entries', String(points.length), range === 'all' ? 'All stored history' : range === '7d' ? 'Last 7 days' : 'Last 30 days')}
      </div>
      <article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODY TREND</span><h3>Bodyweight</h3>${bodyChart(points)}</article>
    </div>`
  }

  function overviewView(context, lifts, data, events) {
    const currentBody = data.body.length ? data.body[data.body.length - 1] : null
    const recentPrs = events.filter(x => /actual|all_time_pr|estimate|e1rm/i.test(x.type)).length
    const programLabel = context.program ? `${context.program}${context.week ? ` · Week ${context.week}` : ''}` : 'Current program'
    const latestWorkout = data.workouts[0]
    return `<div class="lmf-pg-overview">
      <div class="lmf-pg-summary-grid">
        ${summaryCard('Current Program', programLabel, context.week ? 'Active training phase' : 'Program context')}
        ${summaryCard('Logged Sessions', String(data.workouts.length), range === 'all' ? 'All stored history' : range === '7d' ? 'Last 7 days' : 'Last 30 days')}
        ${summaryCard('Bodyweight', currentBody ? `${currentBody.value} ${currentBody.unit}` : '—', currentBody ? shortDate(currentBody.date) : 'No entry found')}
        ${summaryCard('Recent Max Events', String(recentPrs), 'PR / 1RM / e1RM history')}
      </div>
      <div class="lmf-pg-two-col">
        <article class="lmf-pg-panel"><span class="lmf-pg-kicker">PROGRAM MOMENTUM</span><h3>Training Snapshot</h3><div class="lmf-pg-momentum"><strong>${data.workouts.length}</strong><span>sessions in selected range</span></div><p>${latestWorkout ? `Latest logged session: ${shortDate(latestWorkout.date)}${latestWorkout.program ? ` · ${escapeHtml(latestWorkout.program)}` : ''}.` : 'No completed-session record was detected in the selected range.'}</p></article>
        <article class="lmf-pg-panel insight"><span class="lmf-pg-kicker">COACH INSIGHT</span><h3>What the data says</h3><p>${escapeHtml(coachInsight(lifts, data))}</p><div class="lmf-pg-milestone"><small>NEXT MILESTONE</small><strong>${escapeHtml(milestone(lifts))}</strong></div></article>
      </div>
      <article class="lmf-pg-panel"><span class="lmf-pg-kicker">STRENGTH SNAPSHOT</span><h3>Main Lift Status</h3><div class="lmf-pg-strength-strip">${lifts.slice(0, 7).map(lift => { const t = trendForLift(lift); return `<span><b>${escapeHtml(lift.name)}</b><strong>${loadText(lift.estimated1rm || lift.actual1rm, lift.unit)}</strong><small class="is-${t.dir}">${t.dir === 'up' ? '↑' : t.dir === 'down' ? '↓' : '→'} ${escapeHtml(t.label)}</small></span>` }).join('') || '<div class="lmf-pg-empty compact">Add Strength Maxes to populate this snapshot.</div>'}</div></article>
      <div class="lmf-pg-two-col">
        <article class="lmf-pg-panel chart"><span class="lmf-pg-kicker">BODYWEIGHT TREND</span><h3>Selected Range</h3>${bodyChart(data.body)}</article>
        <article class="lmf-pg-panel"><span class="lmf-pg-kicker">RECENT PRs</span><h3>Latest Strength Events</h3>${events.length ? `<div class="lmf-pg-mini-feed">${events.slice(0,4).map(x => `<div><span>${escapeHtml(x.liftName)}</span><b>${loadText(x.value,x.unit)}</b><small>${shortDate(x.date)}</small></div>`).join('')}</div>` : '<div class="lmf-pg-empty compact">No max events in this range yet.</div>'}</article>
      </div>
    </div>`
  }

  function tabButton(id, label) {
    return `<button type="button" role="tab" data-pg-tab="${id}" aria-selected="${activeTab === id ? 'true' : 'false'}">${label}</button>`
  }

  function render(root, heading) {
    const existing = document.getElementById(ROOT_ID)
    const data = privateDataSnapshot()
    const lifts = liftRows()
    const events = historyEvents()
    const context = programContext(root)

    const el = existing || document.createElement('section')
    el.id = ROOT_ID
    el.className = 'lmf-progress-dashboard'
    el.innerHTML = `
      <header class="lmf-pg-header">
        <div><span>ATHLETE PERFORMANCE</span><h2>PROGRESS DASHBOARD</h2><p>Verified training data first. Calculated values stay labeled and never rewrite programming.</p></div>
        <select data-pg-range aria-label="Progress date range"><option value="7d" ${range === '7d' ? 'selected' : ''}>7 DAYS</option><option value="30d" ${range === '30d' ? 'selected' : ''}>30 DAYS</option><option value="all" ${range === 'all' ? 'selected' : ''}>ALL TIME</option></select>
      </header>
      <nav class="lmf-pg-tabs" role="tablist" aria-label="Progress sections">
        ${tabButton('overview','OVERVIEW')}${tabButton('strength','STRENGTH')}${tabButton('body','BODY')}${tabButton('conditioning','CONDITIONING')}${tabButton('prs','PRs')}
      </nav>
      <div class="lmf-pg-tabbody" role="tabpanel" data-pg-panel="${activeTab}">
        ${activeTab === 'overview' ? overviewView(context,lifts,data,events) : activeTab === 'strength' ? strengthCards(lifts) : activeTab === 'body' ? bodyView(data) : activeTab === 'conditioning' ? conditioningView(data) : prFeed(events)}
      </div>`

    if (!existing) heading.insertAdjacentElement('afterend', el)
    const legacyMaxes = root.querySelector('#lmf-strength-maxes-progress')
    if (legacyMaxes) legacyMaxes.hidden = true
    bind(el)

    window.__LMF_PROGRESS_DASHBOARD__ = {
      version:1,
      refresh:queueRender,
      getTab:() => activeTab,
      setTab:(tab) => { if (TABS.includes(tab)) { activeTab = tab; writeSetting(TAB_KEY,tab); queueRender() } },
    }
  }

  function bind(el) {
    el.querySelectorAll('[data-pg-tab]').forEach(button => button.addEventListener('click', () => {
      const next = button.getAttribute('data-pg-tab')
      if (!TABS.includes(next) || next === activeTab) return
      activeTab = next
      writeSetting(TAB_KEY, next)
      queueRender()
    }))
    el.querySelector('[data-pg-range]')?.addEventListener('change', event => {
      const next = event.target.value
      if (!RANGES.includes(next)) return
      range = next
      writeSetting(RANGE_KEY, next)
      queueRender()
    })
  }

  function scan() {
    scanQueued = false
    const heading = visibleProgressHeading()
    if (!heading) return
    const root = progressRoot(heading)
    if (!root) return
    render(root, heading)
  }

  function queueRender() {
    window.clearTimeout(renderTimer)
    renderTimer = window.setTimeout(() => {
      const existing = document.getElementById(ROOT_ID)
      if (existing && !isVisible(existing) && !visibleProgressHeading()) return
      scan()
    }, 40)
  }

  function queueScan() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(scan)
  }

  function boot() {
    queueScan()
    new MutationObserver(queueScan).observe(document.body, { childList:true, subtree:true })
    window.addEventListener('lmf:strength-maxes-updated', queueRender)
    window.addEventListener('storage', event => {
      if (!event.key || event.key === MAXES_KEY || /workout|history|readiness|profile|body|weight/i.test(event.key)) queueRender()
    })
    document.addEventListener('visibilitychange', () => { if (!document.hidden) queueRender() })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
