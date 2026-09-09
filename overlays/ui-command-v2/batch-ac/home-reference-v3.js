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
    const performanceCard = [...(grid?.querySelectorAll('.status-card') || [])].find((card) => !card.classList.contains('readiness-card')) || null
    return {
      program,
      positionLabel,
      workout,
      setLabel,
      trainingType,
      readiness,
      performance:meaningfulLines(performanceCard, 3),
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
    const html = performance.map((line) => `<li>${esc(line)}</li>`).join('')
    if (list && list.innerHTML !== html) list.innerHTML = html
    setText(shell, '[data-lmf-milestone]', data.milestone.length ? data.milestone.join(' · ') : 'Your next meaningful training target will appear here.')
    setText(shell, '[data-lmf-coach]', data.coach.length ? data.coach.join(' · ') : 'Execute today’s prescription cleanly. Quality before load.')
  }

  async function idbAll(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).getAll()
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => resolve([])
    })
  }

  async function readSummary() {
    if (summaryCache) return summaryCache
    if (!('indexedDB' in window)) return null
    return await new Promise((resolve) => {
      let request
      try { request = indexedDB.open(DB_NAME) } catch (_) { resolve(null); return }
      request.onupgradeneeded = () => { try { request.transaction.abort() } catch (_) {} }
      request.onerror = () => resolve(null)
      request.onsuccess = async () => {
        const db = request.result
        try {
          const [athletes,sessions,prs,body,tms] = await Promise.all([
            idbAll(db,'athletes'), idbAll(db,'workoutSessions'), idbAll(db,'personalRecords'), idbAll(db,'bodyweightEntries'), idbAll(db,'trainingMaxHistory')
          ])
          const live = (rows) => rows.filter((row) => row && !row.deleted_at)
          const athlete = live(athletes).sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null
          const athleteId = athlete?.id
          const owned = (rows) => live(rows).filter((row) => !athleteId || !row.athlete_id || row.athlete_id === athleteId)
          const completed = owned(sessions).filter((row) => row.status === 'completed' || row.completed_at)
          const tmRows = owned(tms)
          const weights = owned(body).map((row) => ({
            date:new Date(row.measured_at || row.recorded_at || row.created_at || 0),
            value:Number(row.value ?? row.bodyweight_value ?? row.weight_value ?? row.weight),
            unit:String(row.unit || row.bodyweight_unit || row.weight_unit || athlete?.default_weight_unit || 'lb')
          })).filter((row) => Number.isFinite(row.value) && row.value > 0).sort((a,b) => b.date - a.date)
          const name = athlete?.display_name || athlete?.name || athlete?.first_name || 'Athlete'
          summaryCache = {
            name,
            initials:initials(name),
            tracked:new Set(tmRows.map((row) => row.exercise_key).filter(Boolean)).size,
            workouts:completed.length,
            prs:owned(prs).length,
            bodyweight:weights[0] ? `${Math.round(weights[0].value * 10) / 10} ${weights[0].unit}` : '—'
          }
          resolve(summaryCache)
        } catch (_) { resolve(null) }
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
    try {
      const data = await readSummary()
      const shell = document.querySelector(`.${HOME_SHELL_CLASS}`)
      if (!data || !shell || !document.body.classList.contains(ROOT_CLASS)) return
      setIfChanged(shell.querySelector('[data-lmf-greeting]'), `${timeGreeting()}, ${data.name}.`)
      setIfChanged(shell.querySelector('[data-lmf-avatar]'), data.initials)
      const setStat = (key, value) => setIfChanged(shell.querySelector(`[data-stat="${key}"]`), String(value ?? '—'))
      setStat('lifts', data.tracked || '—')
      setStat('workouts', data.workouts)
      setStat('prs', data.prs)
      setStat('bodyweight', data.bodyweight)
    } finally { reading = false }
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
    window.addEventListener('hashchange', () => { summaryCache = null; queue() })
    window.addEventListener('popstate', queue)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { summaryCache = null; queue() } })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
