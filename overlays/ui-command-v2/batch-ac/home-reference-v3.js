(() => {
  'use strict'

  const ROOT_CLASS = 'lmf-home-ref3-active'
  const HOME_SHELL_CLASS = 'lmf-home-command-v4'
  const SOURCE_CLASS = 'lmf-home-source-v4'
  const DB_NAME = 'letmefly-private'
  // Compatibility marker retained for the existing installer: lmf-home-stat-strip
  let scanQueued = false
  let reading = false
  let summaryCache = null
  let summaryStatus = 'loading'
  let summaryRevision = 0

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  const clean = (value, fallback='') => String(value ?? fallback).replace(/\s+/g, ' ').trim()

  function isHomeRoute() {
    const hash = clean(location.hash).toLowerCase()
    return hash === '' || hash === '#' || hash === '#/' || hash === '#/home' || hash.startsWith('#/home?') || hash === '#/dashboard'
  }

  function timeGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  function initials(name) {
    const value = clean(name)
    if (!value) return 'AT'
    const parts = value.split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0].slice(0, 2)).toUpperCase()
  }

  function sourceText(root, selector, fallback='') {
    return clean(root?.querySelector(selector)?.textContent, fallback)
  }

  function findSourceHero() {
    if (!isHomeRoute()) return null
    const candidates = [...document.querySelectorAll('.command-hero')].filter((el) => !el.closest(`.${HOME_SHELL_CLASS}`))
    return candidates.find((hero) => hero.parentElement?.querySelector(':scope > .dashboard-grid')) || candidates[0] || null
  }

  function findSourceGrid(hero) {
    return hero?.parentElement?.querySelector(':scope > .dashboard-grid') || null
  }

  function parseReadiness(card) {
    const entries = [...(card?.querySelectorAll('.readiness-ring') || [])].map((ring) => {
      const label = clean(ring.querySelector('span')?.textContent).toLowerCase()
      const raw = clean(ring.querySelector('strong')?.textContent)
      const match = raw.match(/([0-9.]+)\s*\/\s*([0-9.]+)/)
      return match ? { label, value:Number(match[1]), max:Number(match[2]) } : null
    }).filter(Boolean)
    if (!entries.length) return { score:null }

    const metric = (label, invert=false) => {
      const item = entries.find((x) => x.label.includes(label))
      if (!item || !item.max) return null
      const normalized = Math.max(0, Math.min(1, item.value / item.max))
      return invert ? 1 - Math.max(0, Math.min(1, (item.value - 1) / Math.max(1, item.max - 1))) : normalized
    }
    const sleep = metric('sleep')
    const energy = metric('energy')
    const soreness = metric('soreness', true)
    const values = [sleep, energy, soreness].filter((value) => value != null)
    if (!values.length) return { score:null }
    const score = sleep != null && energy != null && soreness != null
      ? Math.round((sleep * .35 + energy * .35 + soreness * .30) * 100)
      : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100)
    return { score:Math.max(0, Math.min(100, score)) }
  }

  function readinessLabel(score) {
    if (score == null) return 'Readiness check'
    if (score >= 80) return 'Ready to train'
    if (score >= 60) return 'Train with intent'
    return 'Recovery first'
  }

  function readinessCopy(score) {
    if (score == null) return 'Log sleep, energy, and soreness before training.'
    if (score >= 80) return 'Recovery signals support today’s work.'
    if (score >= 60) return 'Stay inside the programmed effort and watch technique.'
    return 'Use the governed readiness guidance before loading up.'
  }

  function meaningfulLines(card, max=3) {
    if (!card) return []
    const selectors = ['.performance-list > div', 'li', '.status-row', '.milestone-copy', '.coach-copy', 'p']
    const nodes = selectors.flatMap((selector) => [...card.querySelectorAll(selector)])
    const seen = new Set()
    const lines = []
    for (const node of nodes) {
      const value = clean(node.textContent)
      if (!value || value.length < 3 || seen.has(value)) continue
      seen.add(value)
      lines.push(value)
      if (lines.length >= max) break
    }
    return lines
  }

  function recentPerformance() {
    if (summaryStatus === 'loading') return ['Loading recent performance…', 'Reading your saved workout history.']
    if (summaryStatus === 'unavailable') return ['Recent performance unavailable', 'Your saved history could not be read. Reopen Home to try again.']
    const latest = summaryCache?.latestCompleted
    if (!latest) return ['No completed workout yet', 'Finish a session to start your performance history.']
    const date = new Date(clean(latest.completed_at))
    const completed = Number.isFinite(date.getTime())
      ? `Completed ${new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' }).format(date)}`
      : 'Completed session'
    const program = clean(latest.program_name || latest.program_key).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    const week = Number(latest.week_number)
    const day = clean(latest.day_key).match(/^(?:day[-_ ]*)?(\d+)$/i)
    return [
      clean(latest.workout_name, 'Completed workout') || 'Completed workout',
      [completed, program, Number.isInteger(week) && week > 0 ? `Week ${week}` : '', day ? `Day ${Number(day[1])}` : ''].filter(Boolean).join(' · ')
    ]
  }

  function commandData(hero, grid) {
    const program = sourceText(hero, '.hero-brandline span', 'CURRENT PROGRAM').toUpperCase()
    const position = sourceText(hero, '.hero-content .page-kicker', 'CURRENT SESSION')
    const workout = sourceText(hero, '.hero-title', 'TODAY’S WORKOUT')
    const progressText = sourceText(hero, '.hero-progress strong', 'SESSION')
    const tags = [...hero.querySelectorAll('.hero-tags span')].map((el) => clean(el.textContent)).filter(Boolean)
    const weekDay = position.match(/week\s*(\d+).*?day\s*(\d+)/i)
    const positionLabel = weekDay ? `Week ${weekDay[1]} · Day ${weekDay[2]}` : position.replace(/^(?:CROWNFORGE|BLACK CROWN)\s*[•·-]?\s*/i, '')
    const setMatch = progressText.match(/(\d+)\s*\/\s*(\d+)\s*sets?/i)
    const setLabel = setMatch ? `${setMatch[1]} / ${setMatch[2]} sets` : progressText
    const trainingType = tags.slice(0, 2).join(' · ') || 'Strength training'
    const readiness = parseReadiness(grid?.querySelector('.readiness-card'))
    return {
      program,
      positionLabel,
      workout,
      setLabel,
      trainingType,
      readiness,
      performance:recentPerformance(),
      milestone:meaningfulLines(grid?.querySelector('.milestone-card'), 2),
      coach:meaningfulLines(grid?.querySelector('.coach-focus-card'), 2)
    }
  }

  function renderShell(data) {
    const score = data.readiness.score
    const performance = data.performance.length ? data.performance : ['Complete a workout to build your recent-performance feed.']
    const milestone = data.milestone.length ? data.milestone.join(' · ') : 'Your next meaningful training target will appear here.'
    const coach = data.coach.length ? data.coach.join(' · ') : 'Execute today’s prescription cleanly. Quality before load.'
    const shell = document.createElement('section')
    shell.className = HOME_SHELL_CLASS
    shell.setAttribute('aria-label', 'LetMeFly Home command center')
    shell.innerHTML = `
      <header class="lmf-home-v4-greeting">
        <div>
          <p class="lmf-home-v4-eyebrow">ATHLETE COMMAND CENTER</p>
          <h1><span data-lmf-greeting>${esc(timeGreeting())}, Athlete.</span></h1>
          <p>Discipline today. A stronger tomorrow.</p>
        </div>
        <div class="lmf-home-v4-identity" aria-label="Athlete profile"><span class="lmf-home-v4-avatar" data-lmf-avatar>AT</span></div>
      </header>

      <article class="lmf-home-v4-command">
        <div class="lmf-home-v4-command-main">
          <p class="lmf-home-v4-kicker">YOUR COMMAND</p>
          <div class="lmf-home-v4-program-row"><h2 data-lmf-program>${esc(data.program)}</h2><span class="lmf-home-v4-live">ACTIVE</span></div>
          <p class="lmf-home-v4-tagline">BUILDING STRONGER HUMANS</p>
          <p class="lmf-home-v4-position" data-lmf-position>${esc(data.positionLabel)}</p>
          <h3 data-lmf-workout>${esc(data.workout)}</h3>
          <div class="lmf-home-v4-meta" aria-label="Workout summary">
            <div><span>SESSION</span><strong data-lmf-session>${esc(data.positionLabel)}</strong></div>
            <div><span>PROGRESS</span><strong data-lmf-sets>${esc(data.setLabel)}</strong></div>
            <div><span>FOCUS</span><strong data-lmf-type>${esc(data.trainingType)}</strong></div>
          </div>
          <button type="button" class="lmf-home-v4-start" data-lmf-start>Start Workout <span aria-hidden="true">→</span></button>
        </div>
        <div class="lmf-home-v4-command-mark" aria-hidden="true"><div class="lmf-home-v4-crown">♛</div><span>THE CROWN IS EARNED</span></div>
      </article>

      <section class="lmf-home-v4-grid" aria-label="Today at a glance">
        <article class="lmf-home-v4-panel lmf-home-v4-readiness" data-lmf-route="train" tabindex="0" role="link">
          <div class="lmf-home-v4-panel-head"><span>READINESS</span><b>Today</b></div>
          <div class="lmf-home-v4-readiness-body">
            <div class="lmf-home-v4-score"><strong data-lmf-readiness-score>${score == null ? '—' : esc(score)}</strong><small>/100</small></div>
            <div><h3 data-lmf-readiness-label>${esc(readinessLabel(score))}</h3><p data-lmf-readiness-copy>${esc(readinessCopy(score))}</p></div>
          </div>
          <div class="lmf-home-v4-panel-link">Open readiness <span>→</span></div>
        </article>

        <article class="lmf-home-v4-panel lmf-home-v4-performance" data-lmf-route="progress" tabindex="0" role="link">
          <div class="lmf-home-v4-panel-head"><span>RECENT PERFORMANCE</span><b>Trend</b></div>
          <div class="lmf-home-v4-spark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <ul data-lmf-performance>${performance.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
          <div class="lmf-home-v4-panel-link">View progress <span>→</span></div>
        </article>

        <article class="lmf-home-v4-panel lmf-home-v4-milestone" data-lmf-route="progress" tabindex="0" role="link">
          <div class="lmf-home-v4-panel-head"><span>NEXT MILESTONE</span><b>Forward</b></div>
          <div class="lmf-home-v4-milestone-icon" aria-hidden="true">◆</div>
          <p data-lmf-milestone>${esc(milestone)}</p>
          <div class="lmf-home-v4-panel-link">See milestones <span>→</span></div>
        </article>

        <article class="lmf-home-v4-panel lmf-home-v4-coach" data-lmf-route="coach" tabindex="0" role="link">
          <div class="lmf-home-v4-panel-head"><span>COACH INSIGHT</span><b>Focus</b></div>
          <blockquote data-lmf-coach>${esc(coach)}</blockquote>
          <div class="lmf-home-v4-panel-link">Ask Coach <span>→</span></div>
        </article>
      </section>

      <section class="lmf-home-v4-stats" aria-label="Athlete snapshot">
        <div><span>TRACKED LIFTS</span><strong data-stat="lifts">—</strong></div>
        <div><span>WORKOUTS</span><strong data-stat="workouts">—</strong></div>
        <div><span>PERSONAL RECORDS</span><strong data-stat="prs">—</strong></div>
        <div><span>BODYWEIGHT</span><strong data-stat="bodyweight">—</strong></div>
      </section>`
    return shell
  }

  function addTopbarIdentity() {
    const topbar = document.querySelector('.topbar')
    if (!topbar || topbar.querySelector('.lmf-home-topbar-shell')) return
    const shell = document.createElement('div')
    shell.className = 'lmf-home-topbar-shell'
    shell.innerHTML = `<div class="lmf-home-brand-lockup"><img src="/app-icon-official-v6.svg?v=6" alt="" aria-hidden="true"><div><strong>LetMe<span>Fly</span></strong><small>STRENGTH BUILDS FREEDOM</small></div></div>`
    topbar.appendChild(shell)
  }

  function bindShell(shell) {
    if (shell.dataset.lmfBound === 'true') return
    shell.dataset.lmfBound = 'true'
    shell.addEventListener('click', (event) => {
      const start = event.target.closest('[data-lmf-start]')
      if (start) {
        const sourceHero = findSourceHero()
        const sourceStart = sourceHero?.querySelector('.hero-start, [data-start-workout], button[class*="start"]')
        if (sourceStart && sourceStart !== start) sourceStart.click()
        else location.hash = '#/train'
        return
      }
      const card = event.target.closest('[data-lmf-route]')
      if (!card || event.target.closest('button,a,input,select,textarea')) return
      location.hash = `#/${card.dataset.lmfRoute}`
    })
    shell.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return
      const card = event.target.closest('[data-lmf-route]')
      if (!card) return
      event.preventDefault()
      location.hash = `#/${card.dataset.lmfRoute}`
    })
  }

  function markSources(hero, grid) {
    hero.classList.add(SOURCE_CLASS)
    grid?.classList.add(SOURCE_CLASS)
    hero.parentElement?.querySelector(':scope > .lmf-home-greeting')?.classList.add(SOURCE_CLASS)
    hero.parentElement?.querySelector(':scope > .lmf-home-stat-strip')?.classList.add(SOURCE_CLASS)
  }

  function unmount() {
    document.body.classList.remove(ROOT_CLASS)
    document.querySelectorAll(`.${HOME_SHELL_CLASS}`).forEach((el) => el.remove())
    document.querySelectorAll(`.${SOURCE_CLASS}`).forEach((el) => el.classList.remove(SOURCE_CLASS))
    document.querySelectorAll('.lmf-home-topbar-shell').forEach((el) => el.remove())
  }

  function setText(shell, selector, value) {
    const el = shell.querySelector(selector)
    const next = clean(value)
    if (el && clean(el.textContent) !== next) el.textContent = next
  }

  function refreshShell(shell, data) {
    setText(shell, '[data-lmf-program]', data.program)
    setText(shell, '[data-lmf-position]', data.positionLabel)
    setText(shell, '[data-lmf-workout]', data.workout)
    setText(shell, '[data-lmf-session]', data.positionLabel)
    setText(shell, '[data-lmf-sets]', data.setLabel)
    setText(shell, '[data-lmf-type]', data.trainingType)
    setText(shell, '[data-lmf-readiness-score]', data.readiness.score == null ? '—' : String(data.readiness.score))
    setText(shell, '[data-lmf-readiness-label]', readinessLabel(data.readiness.score))
    setText(shell, '[data-lmf-readiness-copy]', readinessCopy(data.readiness.score))
    const performance = data.performance.length ? data.performance : ['Complete a workout to build your recent-performance feed.']
    const list = shell.querySelector('[data-lmf-performance]')
    const rows = list ? [...list.children] : []
    if (list && (rows.length !== performance.length || rows.some((row, index) => row.tagName !== 'LI' || row.textContent !== performance[index]))) {
      list.innerHTML = performance.map((line) => `<li>${esc(line)}</li>`).join('')
    }
    setText(shell, '[data-lmf-milestone]', data.milestone.length ? data.milestone.join(' · ') : 'Your next meaningful training target will appear here.')
    setText(shell, '[data-lmf-coach]', data.coach.length ? data.coach.join(' · ') : 'Execute today’s prescription cleanly. Quality before load.')
  }

  async function idbAll(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return []
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).getAll()
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => reject(req.error || new Error('Saved history could not be read'))
      tx.onabort = () => reject(tx.error || new Error('Saved history read was interrupted'))
    })
  }

  async function readSummary() {
    if (summaryCache) return summaryCache
    if (summaryStatus === 'unavailable') return null
    const revision = summaryRevision
    const unavailable = () => {
      if (revision === summaryRevision) summaryStatus = 'unavailable'
      return null
    }
    if (!('indexedDB' in window)) return unavailable()
    return await new Promise((resolve) => {
      let request
      let blocked = false
      try { request = indexedDB.open(DB_NAME) } catch (_) { resolve(unavailable()); return }
      request.onupgradeneeded = () => { try { request.transaction.abort() } catch (_) {} }
      request.onerror = () => resolve(unavailable())
      request.onblocked = () => { blocked = true; resolve(unavailable()) }
      request.onsuccess = async () => {
        const db = request.result
        try {
          if (blocked || revision !== summaryRevision) { resolve(null); return }
          if (!db.objectStoreNames.contains('workoutSessions')) { resolve(unavailable()); return }
          const [athletes,sessions,prs,body,tms,readiness,sets,exercises,prefs] = await Promise.all([
            idbAll(db,'athletes'), idbAll(db,'workoutSessions'), idbAll(db,'personalRecords'), idbAll(db,'bodyweightEntries'), idbAll(db,'trainingMaxHistory'),
            idbAll(db,'readinessEntries'), idbAll(db,'workoutSets'), idbAll(db,'workoutExercises'), idbAll(db,'athletePreferences')
          ])
          const live = (rows) => rows.filter((row) => row && !row.deleted_at)
          // Match the app's getActiveAthlete() selection and keep history
          // strictly scoped to that athlete.
          const athlete = live(athletes)[0] || null
          if (!athlete) { resolve(unavailable()); return }
          const athleteId = athlete?.id
          const owned = (rows) => live(rows).filter((row) => !athleteId || !row.athlete_id || row.athlete_id === athleteId)
          const completed = live(sessions).filter((row) => row.athlete_id === athleteId && (row.status === 'completed' || row.completed_at))
          const tmRows = owned(tms)
          const weights = owned(body).map((row) => ({
            date:new Date(row.measured_at || row.recorded_at || row.created_at || 0),
            value:Number(row.value ?? row.bodyweight_value ?? row.weight_value ?? row.weight),
            unit:String(row.unit || row.bodyweight_unit || row.weight_unit || athlete?.default_weight_unit || 'lb')
          })).filter((row) => Number.isFinite(row.value) && row.value > 0).sort((a,b) => b.date - a.date)
          const name = athlete?.display_name || athlete?.name || athlete?.first_name || 'Athlete'
          if (revision !== summaryRevision) { resolve(null); return }
          const completedTime = (row) => Date.parse(row.completed_at || '') || 0
          const latestCompleted = [...completed].sort((a,b) => completedTime(b) - completedTime(a))[0] || null
          const latestReadiness = live(readiness).filter(row => row.athlete_id === athleteId)
            .sort((a,b) => (Date.parse(b.recorded_at || b.created_at) || 0) - (Date.parse(a.recorded_at || a.created_at) || 0))[0] || null
          const weightUnit = live(prefs).find(row => row.athlete_id === athleteId)?.weight_unit === 'kg' ? 'kg' : 'lb'
          const exerciseMap = new Map(live(exercises).filter(row => row.athlete_id === athleteId).map(row => [row.id,row]))
          const savedSets = live(sets).filter(row => row.athlete_id === athleteId && row.workout_session_id === latestCompleted?.id && row.completed === true)
          // Rep volume and the heaviest rep set use completed observations only.
          // Distance/time prescriptions never become rep volume, even in legacy rows.
          const repSets = savedSets.filter(row => {
            const perf = row.performance_data || {}
            const metric = [perf.actualMetricKind,perf.metricKind,perf.programmedReps].filter(Boolean).join(' ')
            return !String(perf.distance ?? '').trim() && !String(perf.duration ?? '').trim()
              && !/distance|duration|\d\s*(?:sec(?:onds?)?|min(?:utes?)?|hrs?|meters?|metres?|yards?|yd|ft|m)\b/i.test(metric)
              && ['kg','lb'].includes(row.load_unit) && Number(row.reps) > 0 && Number(row.load_value) > 0 && exerciseMap.has(row.workout_exercise_id)
          }).map(row => ({...row,displayLoad:Number(row.load_value) * (row.load_unit === weightUnit ? 1 : row.load_unit === 'kg' && weightUnit === 'lb' ? 2.2046226218 : row.load_unit === 'lb' && weightUnit === 'kg' ? 1 / 2.2046226218 : 1)}))
          const topSet = [...repSets].sort((a,b) => b.displayLoad - a.displayLoad || Number(b.reps) - Number(a.reps))[0]
          const rpes = savedSets.map(row => row.rpe == null || row.rpe === '' ? NaN : Number(row.rpe)).filter(value => Number.isFinite(value) && value >= 1 && value <= 10)
          const format = value => new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value)
          summaryCache = {
            name,
            initials:initials(name),
            tracked:new Set(tmRows.map((row) => row.exercise_key).filter(Boolean)).size,
            workouts:completed.length,
            latestCompleted,
            latestReadiness,
            performanceMetrics:{
              volume:repSets.length ? `${format(repSets.reduce((sum,row) => sum + row.displayLoad * Number(row.reps),0))} ${weightUnit}·reps` : '—',
              top:topSet ? `${exerciseMap.get(topSet.workout_exercise_id).exercise_name_snapshot || exerciseMap.get(topSet.workout_exercise_id).exercise_key} · ${format(topSet.displayLoad)} ${weightUnit} × ${topSet.reps}` : '—',
              rpe:rpes.length ? format(rpes.reduce((sum,value) => sum + value,0) / rpes.length) : '—'
            },
            prs:owned(prs).length,
            bodyweight:weights[0] ? `${Math.round(weights[0].value * 10) / 10} ${weights[0].unit}` : '—'
          }
          summaryStatus = 'ready'
          resolve(summaryCache)
        } catch (_) { resolve(unavailable()) }
        finally { try { db.close() } catch (_) {} }
      }
    })
  }

  function setIfChanged(el, value) {
    if (el && el.textContent !== value) el.textContent = value
  }

  async function hydratePrivateSummary() {
    if (reading) return
    reading = true
    const revision = summaryRevision
    const previousStatus = summaryStatus
    const shell = document.querySelector(`.${HOME_SHELL_CLASS}`)
    try {
      const data = await readSummary()
      if (!data || revision !== summaryRevision || !shell?.isConnected || shell !== document.querySelector(`.${HOME_SHELL_CLASS}`) || !document.body.classList.contains(ROOT_CLASS)) return
      setIfChanged(shell.querySelector('[data-lmf-greeting]'), `${timeGreeting()}, ${data.name}.`)
      setIfChanged(shell.querySelector('[data-lmf-avatar]'), data.initials)
      const setStat = (key, value) => setIfChanged(shell.querySelector(`[data-stat="${key}"]`), String(value ?? '—'))
      setStat('lifts', data.tracked || '—')
      setStat('workouts', data.workouts)
      setStat('prs', data.prs)
      setStat('bodyweight', data.bodyweight)
      for (const key of ['sleep_quality','energy','soreness','stress']) {
        const value = data.latestReadiness?.[key]
        setIfChanged(shell.querySelector(`[data-lmf-home-readiness="${key}"]`), value != null && Number.isFinite(Number(value)) ? `${value}/5` : '—')
      }
      const readinessDate = data.latestReadiness?.recorded_at || data.latestReadiness?.created_at
      const date = new Date(readinessDate || '')
      setIfChanged(shell.querySelector('[data-lmf-home-readiness-date]'), Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(date) : 'Check in')
      for (const key of ['volume','top','rpe']) setIfChanged(shell.querySelector(`[data-lmf-home-performance="${key}"]`),data.performanceMetrics[key])
    } finally {
      reading = false
      if (isHomeRoute() && (revision !== summaryRevision || previousStatus !== summaryStatus)) queue()
    }
  }

  function mount() {
    const hero = findSourceHero()
    if (!hero) { unmount(); return }
    const page = hero.parentElement
    const grid = findSourceGrid(hero)
    if (!page) return
    document.body.classList.add(ROOT_CLASS)
    page.classList.add('lmf-home-reference-v3')
    markSources(hero, grid)
    addTopbarIdentity()
    const data = commandData(hero, grid)
    let shell = page.querySelector(`:scope > .${HOME_SHELL_CLASS}`)
    if (!shell) {
      shell = renderShell(data)
      page.insertBefore(shell, hero)
      bindShell(shell)
    } else refreshShell(shell, data)
    void hydratePrivateSummary()
  }

  function apply() {
    scanQueued = false
    if (!isHomeRoute()) { unmount(); return }
    mount()
  }

  function queue() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(apply)
  }

  function boot() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList:true, subtree:true })
    const refreshSummary = () => { summaryRevision++; summaryCache = null; summaryStatus = 'loading'; queue() }
    window.addEventListener('hashchange', refreshSummary)
    window.addEventListener('popstate', queue)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSummary() })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
