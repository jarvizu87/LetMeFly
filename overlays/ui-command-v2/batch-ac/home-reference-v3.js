(() => {
  'use strict'

  const ROOT_CLASS = 'lmf-home-ref3-active'
  const DB_NAME = 'letmefly-private'
  let scanQueued = false
  let reading = false
  let summaryCache = null

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  const visible = (el) => Boolean(el?.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length)

  function homeHero() {
    return [...document.querySelectorAll('.command-hero')].find(visible) || null
  }

  function timeGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  function initials(name) {
    const clean = String(name || '').trim()
    if (!clean) return 'JP'
    const parts = clean.split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0].slice(0, 2)).toUpperCase()
  }

  function parseReadiness(card) {
    const entries = [...card?.querySelectorAll('.readiness-ring') || []].map((ring) => {
      const label = (ring.querySelector('span')?.textContent || '').trim().toLowerCase()
      const raw = (ring.querySelector('strong')?.textContent || '').trim()
      const match = raw.match(/([0-9.]+)\s*\/\s*([0-9.]+)/)
      return match ? { label, value:Number(match[1]), max:Number(match[2]) } : null
    }).filter(Boolean)
    if (!entries.length) return null
    const normalized = (label, invert=false) => {
      const item = entries.find((x) => x.label.includes(label))
      if (!item || !item.max) return null
      const n = Math.max(0, Math.min(1, item.value / item.max))
      return invert ? 1 - Math.max(0, Math.min(1, (item.value - 1) / Math.max(1, item.max - 1))) : n
    }
    const sleep = normalized('sleep')
    const energy = normalized('energy')
    const soreness = normalized('soreness', true)
    const values = [sleep, energy, soreness].filter((v) => v != null)
    if (!values.length) return null
    const score = sleep != null && energy != null && soreness != null
      ? Math.round((sleep * .35 + energy * .35 + soreness * .30) * 100)
      : Math.round(values.reduce((a,b) => a + b, 0) / values.length * 100)
    return Math.max(0, Math.min(100, score))
  }

  function scoreLabel(score) {
    if (score == null) return 'Readiness logged'
    if (score >= 80) return 'Ready to Train'
    if (score >= 60) return 'Train with intent'
    return 'Recovery first'
  }

  function enhanceTopbar(hero) {
    const topbar = document.querySelector('.topbar')
    if (!topbar || topbar.querySelector('.lmf-home-topbar-shell')) return
    const shell = document.createElement('div')
    shell.className = 'lmf-home-topbar-shell'
    shell.innerHTML = `
      <div class="lmf-home-brand-lockup">
        <img src="/app-icon-official-v6.svg?v=6" alt="" aria-hidden="true">
        <div><strong>LetMe<span>Fly</span></strong><small>STRENGTH BUILDS FREEDOM</small></div>
      </div>
      <div class="lmf-home-header-actions">
        <span class="lmf-home-bell" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
        <span class="lmf-home-avatar" data-lmf-avatar>JP</span>
      </div>`
    topbar.appendChild(shell)
  }

  function enhanceGreeting(hero) {
    const parent = hero.parentElement
    if (!parent || parent.querySelector(':scope > .lmf-home-greeting')) return
    const block = document.createElement('section')
    block.className = 'lmf-home-greeting'
    block.innerHTML = `<h1><span data-lmf-greeting>${timeGreeting()}, Athlete.</span></h1><p>Discipline today. A stronger tomorrow.</p>`
    parent.insertBefore(block, hero)
  }

  function sourceText(hero, selector, fallback='') {
    return (hero.querySelector(selector)?.textContent || fallback).replace(/\s+/g, ' ').trim()
  }

  function enhanceHero(hero) {
    if (hero.dataset.lmfReferenceV3 === 'true') return
    hero.dataset.lmfReferenceV3 = 'true'
    hero.classList.add('lmf-reference-command-card')

    const content = hero.querySelector('.hero-content') || hero
    const program = sourceText(hero, '.hero-brandline span', 'CROWNFORGE').toUpperCase()
    const position = sourceText(hero, '.hero-content .page-kicker', 'CURRENT SESSION')
    const workout = sourceText(hero, '.hero-title', 'TODAY’S WORKOUT')
    const progressText = sourceText(hero, '.hero-progress strong', 'SESSION')
    const tags = [...hero.querySelectorAll('.hero-tags span')].map((x) => (x.textContent || '').trim()).filter(Boolean)
    const weekDay = position.match(/week\s*(\d+).*?day\s*(\d+)/i)
    const positionLabel = weekDay ? `Week ${weekDay[1]} / Day ${weekDay[2]}` : position.replace(/^CROWNFORGE\s*[•·-]?\s*/i, '')
    const setMatch = progressText.match(/(\d+)\s*\/\s*(\d+)\s*sets?/i)
    const setLabel = setMatch ? `${setMatch[1]} / ${setMatch[2]} sets` : progressText
    const trainingType = tags.slice(0, 2).join(' / ') || 'Strength Training'

    const approved = document.createElement('div')
    approved.className = 'lmf-approved-command-copy'
    approved.innerHTML = `
      <div class="lmf-command-kicker">YOUR COMMAND</div>
      <h2>${esc(program)}</h2>
      <div class="lmf-command-tagline">BUILDING STRONGER HUMANS</div>
      <div class="lmf-command-position">${esc(positionLabel)}</div>
      <h3>${esc(workout)}</h3>
      <div class="lmf-command-meta">
        <span><b>◷</b><small>CURRENT SESSION</small></span>
        <span><b>▥</b><small>${esc(setLabel)}</small></span>
        <span><b>▦</b><small>${esc(trainingType)}</small></span>
      </div>`
    content.insertBefore(approved, content.firstChild)

    ;['.hero-brandline','.hero-content > .page-kicker','.hero-title','.hero-copy','.hero-tags'].forEach((selector) => {
      hero.querySelector(selector)?.classList.add('lmf-ref3-source-hidden')
    })

    const progress = hero.querySelector('.hero-progress')
    if (progress) {
      const label = progress.querySelector('span')
      if (label) label.textContent = 'SESSION PROGRESS'
    }
  }

  function enhanceCards(hero) {
    const parent = hero.parentElement
    const grid = parent?.querySelector('.dashboard-grid')
    if (!grid) return
    grid.classList.add('lmf-home-command-grid')

    const readiness = grid.querySelector('.readiness-card')
    if (readiness && !readiness.querySelector('.lmf-readiness-summary')) {
      const score = parseReadiness(readiness)
      const summary = document.createElement('div')
      summary.className = 'lmf-readiness-summary'
      summary.innerHTML = `<div class="lmf-readiness-score"><strong>${score == null ? '—' : score}</strong></div><div><b>${esc(scoreLabel(score))}</b><small>${score == null ? 'Complete readiness to unlock your score.' : score >= 80 ? 'Good recovery. Train with intent.' : 'Use the governed readiness guidance.'}</small></div>`
      readiness.querySelector('.card-head')?.insertAdjacentElement('afterend', summary)
      readiness.dataset.lmfHomeDest = 'train'
    }

    const performance = [...grid.querySelectorAll('.status-card')].find((x) => !x.classList.contains('readiness-card'))
    if (performance && !performance.querySelector('.lmf-performance-mark')) {
      performance.querySelector('.card-head')?.insertAdjacentHTML('afterend', '<div class="lmf-performance-mark" aria-hidden="true"><i></i><i></i><i></i></div>')
      performance.dataset.lmfHomeDest = 'progress'
    }

    const milestone = grid.querySelector('.milestone-card')
    if (milestone) milestone.dataset.lmfHomeDest = 'progress'
    const coach = grid.querySelector('.coach-focus-card')
    if (coach) coach.dataset.lmfHomeDest = 'coach'

    grid.querySelectorAll('[data-lmf-home-dest]').forEach((card) => {
      if (card.dataset.lmfRefClick === 'true') return
      card.dataset.lmfRefClick = 'true'
      card.tabIndex = 0
      card.setAttribute('role', 'link')
      const go = (event) => {
        if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return
        if (event.target.closest('button,a,input,select,textarea')) return
        location.hash = `#/${card.dataset.lmfHomeDest}`
      }
      card.addEventListener('click', go)
      card.addEventListener('keydown', go)
    })
  }

  function ensureStats(hero) {
    const parent = hero.parentElement
    const grid = parent?.querySelector('.dashboard-grid')
    if (!grid || parent.querySelector(':scope > .lmf-home-stat-strip')) return
    const strip = document.createElement('section')
    strip.className = 'lmf-home-stat-strip'
    strip.innerHTML = `
      <div><span>↔</span><strong data-stat="lifts">—</strong><small>Tracked Lifts</small></div>
      <div><span>▣</span><strong data-stat="workouts">—</strong><small>Workouts Completed</small></div>
      <div><span>★</span><strong data-stat="prs">—</strong><small>Personal Records</small></div>
      <div><span>▰</span><strong data-stat="bodyweight">—</strong><small>Bodyweight</small></div>`
    grid.insertAdjacentElement('afterend', strip)
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
          const live = (rows) => rows.filter((x) => x && !x.deleted_at)
          const athlete = live(athletes).sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null
          const athleteId = athlete?.id
          const owned = (rows) => live(rows).filter((x) => !athleteId || !x.athlete_id || x.athlete_id === athleteId)
          const completed = owned(sessions).filter((x) => x.status === 'completed' || x.completed_at)
          const recordRows = owned(prs)
          const tmRows = owned(tms)
          const tracked = new Set(tmRows.map((x) => x.exercise_key).filter(Boolean)).size
          const weights = owned(body).map((x) => ({
            date:new Date(x.measured_at || x.recorded_at || x.created_at || 0),
            value:Number(x.value ?? x.bodyweight_value ?? x.weight_value ?? x.weight),
            unit:String(x.unit || x.bodyweight_unit || x.weight_unit || athlete?.default_weight_unit || 'lb')
          })).filter((x) => Number.isFinite(x.value) && x.value > 0).sort((a,b) => b.date - a.date)
          const name = athlete?.display_name || athlete?.name || athlete?.first_name || 'Athlete'
          summaryCache = { name, initials:initials(name), tracked, workouts:completed.length, prs:recordRows.length, bodyweight:weights[0] ? `${Math.round(weights[0].value * 10) / 10} ${weights[0].unit}` : '—' }
          resolve(summaryCache)
        } catch (_) { resolve(null) }
        finally { try { db.close() } catch (_) {} }
      }
    })
  }

  async function hydratePrivateSummary() {
    if (reading) return
    reading = true
    try {
      const data = await readSummary()
      if (!data || !document.body.classList.contains(ROOT_CLASS)) return
      const greeting = document.querySelector('[data-lmf-greeting]')
      if (greeting) greeting.textContent = `${timeGreeting()}, ${data.name}.`
      const avatar = document.querySelector('[data-lmf-avatar]')
      if (avatar) avatar.textContent = data.initials
      const set = (key, value) => { const el = document.querySelector(`[data-stat="${key}"]`); if (el) el.textContent = String(value ?? '—') }
      set('lifts', data.tracked || '—')
      set('workouts', data.workouts)
      set('prs', data.prs)
      set('bodyweight', data.bodyweight)
    } finally { reading = false }
  }

  function apply() {
    scanQueued = false
    const hero = homeHero()
    if (!hero) {
      document.body.classList.remove(ROOT_CLASS)
      return
    }
    document.body.classList.add(ROOT_CLASS)
    const page = hero.parentElement
    page?.classList.add('lmf-home-reference-v3')
    enhanceTopbar(hero)
    enhanceGreeting(hero)
    enhanceHero(hero)
    enhanceCards(hero)
    ensureStats(hero)
    void hydratePrivateSummary()
  }

  function queue() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(apply)
  }

  function boot() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList:true, subtree:true })
    window.addEventListener('hashchange', queue)
    window.addEventListener('popstate', queue)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { summaryCache = null; queue() } })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
