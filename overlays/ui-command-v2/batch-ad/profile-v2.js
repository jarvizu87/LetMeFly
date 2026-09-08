(() => {
  'use strict'

  const DB_NAME = 'letmefly-private'
  const SECTION_ID = 'lmf-profile-v2'
  const ROOT_CLASS = 'lmf-profile-v2-active'
  const CONTEXT_KEY = 'profile_context_v2'
  let scanQueued = false
  let rendering = false

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]))
  const visible = (el) => Boolean(el?.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length)
  const text = (value) => String(value ?? '').trim()
  const numeric = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null }
  const live = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => row && !row.deleted_at)

  function profileHero() {
    const hashProfile = location.hash.replace(/^#\//, '').split(/[?#]/)[0] === 'profile'
    if (!hashProfile) return null
    return [...document.querySelectorAll('.profile-hero')].find(visible)
      || [...document.querySelectorAll('h1,h2,h3')].find((el) => /^profile$/i.test(text(el.textContent)) && visible(el))
      || null
  }

  function profileRoot(anchor) {
    if (!anchor) return null
    if (anchor.classList?.contains('profile-hero')) return anchor.parentElement
    return anchor.closest('main,[role="main"],.page,.screen,.view') || anchor.parentElement
  }

  function initials(name) {
    const parts = text(name).split(/\s+/).filter(Boolean)
    if (!parts.length) return 'A'
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0].slice(0, 2)).toUpperCase()
  }

  function programName(key) {
    const raw = text(key)
    if (!raw) return 'No active program'
    if (/crownforge/i.test(raw)) return 'Crownforge'
    if (/black[-_ ]?crown/i.test(raw)) return 'Black Crown'
    if (/maintenance/i.test(raw)) return 'Crown Maintenance'
    return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  }

  function positionText(instance) {
    if (!instance) return 'Program position unavailable'
    const week = numeric(instance.current_week)
    const dayMatch = text(instance.current_day_key).match(/(\d+)/)
    const day = dayMatch ? Number(dayMatch[1]) : null
    const phase = text(instance.current_phase_key).replace(/[-_]+/g, ' ')
    const parts = []
    if (week) parts.push(`Week ${week}`)
    if (day) parts.push(`Day ${day}`)
    if (phase) parts.push(phase.replace(/\b\w/g, (m) => m.toUpperCase()))
    return parts.join(' • ') || 'Active program'
  }

  function latestBy(rows, keys) {
    return [...rows].sort((a, b) => {
      const at = new Date(keys.map((key) => a?.[key]).find(Boolean) || 0).getTime()
      const bt = new Date(keys.map((key) => b?.[key]).find(Boolean) || 0).getTime()
      return bt - at
    })[0] || null
  }

  async function allFrom(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return []
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly')
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
        request.onerror = () => resolve([])
      } catch (_) { resolve([]) }
    })
  }

  async function openPrivateDb() {
    if (!('indexedDB' in window)) return null
    return await new Promise((resolve) => {
      let request
      try { request = indexedDB.open(DB_NAME) } catch (_) { resolve(null); return }
      request.onupgradeneeded = () => { try { request.transaction.abort() } catch (_) {} }
      request.onerror = () => resolve(null)
      request.onsuccess = () => resolve(request.result)
    })
  }

  function bodyweightValue(row, athlete) {
    if (!row) return '—'
    const value = numeric(row.value ?? row.bodyweight_value ?? row.weight_value ?? row.weight)
    if (!value) return '—'
    const unit = text(row.unit || row.bodyweight_unit || row.weight_unit || athlete?.default_weight_unit || 'lb')
    return `${Math.round(value * 10) / 10} ${unit}`
  }

  function owned(rows, athleteId) {
    return live(rows).filter((row) => !athleteId || !row.athlete_id || row.athlete_id === athleteId)
  }

  function strengthSnapshot() {
    try {
      const api = window.__LMF_STRENGTH_MAXES__
      const state = api?.get?.()
      const lifts = state?.lifts && typeof state.lifts === 'object' ? state.lifts : {}
      const populated = Object.entries(lifts).map(([id, row]) => {
        const actual = numeric(row?.actual1rm)
        const estimate = numeric(row?.estimated1rm)
        const pr = numeric(row?.allTimePr)
        const value = actual || estimate || pr
        if (!value) return null
        return { id, name:text(row?.name || id.replace(/_/g, ' ')), value, unit:text(row?.unit || 'lb') }
      }).filter(Boolean)
      return populated.sort((a, b) => b.value - a.value)
    } catch (_) { return [] }
  }

  function normalizeContext(athlete) {
    const context = athlete?.[CONTEXT_KEY] && typeof athlete[CONTEXT_KEY] === 'object' ? athlete[CONTEXT_KEY] : {}
    return {
      age: text(context.age ?? athlete?.age),
      height: text(context.height ?? athlete?.height ?? (athlete?.height_cm ? `${athlete.height_cm} cm` : '')),
      trainingExperience: text(context.trainingExperience ?? athlete?.training_experience),
      trainingHistory: text(context.trainingHistory ?? athlete?.training_history),
      primaryGoal: text(context.primaryGoal ?? athlete?.primary_goal),
      strengthGoals: text(context.strengthGoals ?? athlete?.strength_goals),
      developmentPriorities: text(context.developmentPriorities ?? athlete?.development_priorities),
      preferredExercises: text(context.preferredExercises ?? athlete?.preferred_exercises),
      avoidExercises: text(context.avoidExercises ?? athlete?.avoid_exercises),
      equipment: text(context.equipment ?? athlete?.equipment),
      coachingNotes: text(context.coachingNotes ?? athlete?.coaching_notes),
      updatedAt: text(context.updatedAt),
    }
  }

  function completionScore(name, context) {
    const checks = [
      text(name), context.age, context.height, context.trainingExperience, context.trainingHistory,
      context.primaryGoal, context.strengthGoals, context.developmentPriorities,
      context.preferredExercises || context.avoidExercises, context.equipment,
    ]
    return Math.round(checks.filter((value) => text(value)).length / checks.length * 100)
  }

  async function readVault() {
    const db = await openPrivateDb()
    if (!db) return null
    try {
      const readinessStore = ['readinessEntries','readinessChecks','readiness'].find((name) => db.objectStoreNames.contains(name))
      const [athletes, sessions, prs, body, tms, programs, readiness] = await Promise.all([
        allFrom(db, 'athletes'),
        allFrom(db, 'workoutSessions'),
        allFrom(db, 'personalRecords'),
        allFrom(db, 'bodyweightEntries'),
        allFrom(db, 'trainingMaxHistory'),
        allFrom(db, 'programInstances'),
        readinessStore ? allFrom(db, readinessStore) : Promise.resolve([]),
      ])
      const athlete = latestBy(live(athletes), ['updated_at','created_at'])
      if (!athlete) return null
      const athleteId = athlete.id
      const ownedSessions = owned(sessions, athleteId)
      const completed = ownedSessions.filter((row) => row.status === 'completed' || row.completed_at)
      const weightRows = owned(body, athleteId)
      const latestWeight = latestBy(weightRows, ['measured_at','recorded_at','created_at'])
      const programRows = owned(programs, athleteId)
      const activeProgram = latestBy(programRows.filter((row) => row.status === 'active'), ['updated_at','started_at','created_at'])
        || latestBy(programRows, ['updated_at','started_at','created_at'])
      const tmRows = owned(tms, athleteId)
      const trackedTms = new Set(tmRows.map((row) => row.exercise_key || row.lift_key).filter(Boolean)).size
      const readinessRows = owned(readiness, athleteId)
      return {
        db,
        athlete,
        context: normalizeContext(athlete),
        name: text(athlete.display_name || athlete.name || athlete.first_name || 'Athlete'),
        bodyweight: bodyweightValue(latestWeight, athlete),
        workouts: completed.length,
        prs: owned(prs, athleteId).length,
        trackedTms,
        activeProgram,
        readinessCount: readinessRows.length,
        strength: strengthSnapshot(),
      }
    } catch (_) {
      try { db.close() } catch (_) {}
      return null
    }
  }

  function field(label, key, value, options = {}) {
    const { type='text', placeholder='', textarea=false, hint='', inputmode='' } = options
    const control = textarea
      ? `<textarea id="lmf-profile-${key}" data-profile-key="${key}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input id="lmf-profile-${key}" data-profile-key="${key}" type="${esc(type)}" ${inputmode ? `inputmode="${esc(inputmode)}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}">`
    return `<label class="lmf-profile-field"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`
  }

  function stat(icon, label, value) {
    return `<div class="lmf-profile-stat"><i>${icon}</i><div><strong>${esc(value)}</strong><small>${esc(label)}</small></div></div>`
  }

  function strengthMarkup(rows, trackedTms) {
    if (!rows.length && !trackedTms) return `<div class="lmf-profile-empty">Add Strength Maxes or Training Maxes to build your strength profile.</div>`
    if (!rows.length) return `<div class="lmf-profile-empty">${trackedTms} Training Max${trackedTms === 1 ? '' : 'es'} currently tracked.</div>`
    return `<div class="lmf-profile-lifts">${rows.slice(0, 6).map((row) => `<div><span>${esc(row.name)}</span><strong>${esc(`${row.value} ${row.unit}`)}</strong></div>`).join('')}</div>`
  }

  function renderDossier(vault, root, anchor) {
    const existing = document.getElementById(SECTION_ID)
    if (existing) existing.remove()

    const { athlete, context, name, bodyweight, workouts, prs, trackedTms, activeProgram, readinessCount, strength } = vault
    const completion = completionScore(name, context)
    const program = programName(activeProgram?.program_key)
    const position = positionText(activeProgram)
    const unit = text(athlete.default_weight_unit || 'lb')

    const section = document.createElement('section')
    section.id = SECTION_ID
    section.className = 'lmf-profile-v2'
    section.innerHTML = `
      <div class="lmf-profile-v2-head">
        <div class="lmf-profile-v2-identity">
          <div class="lmf-profile-v2-avatar">${esc(initials(name))}</div>
          <div><span>ATHLETE INTELLIGENCE</span><h2>${esc(name)}</h2><p>Athlete context used to make LetMeFly more personal and useful.</p></div>
        </div>
        <div class="lmf-profile-completion" style="--profile-completion:${completion * 3.6}deg"><strong>${completion}%</strong><small>PROFILE</small></div>
      </div>

      <div class="lmf-profile-stat-grid">
        ${stat('▰', 'Current Bodyweight', bodyweight)}
        ${stat('✓', 'Completed Workouts', String(workouts))}
        ${stat('↔', 'Tracked TMs', trackedTms ? String(trackedTms) : '—')}
        ${stat('★', 'Personal Records', String(prs))}
      </div>

      <article class="lmf-profile-program-card">
        <div><span>CURRENT PROGRAM</span><h3>${esc(program)}</h3><p>${esc(position)}</p></div>
        <div class="lmf-profile-program-actions"><a href="#/program">PROGRAM</a><a href="#/train">TRAIN</a></div>
      </article>

      <div class="lmf-profile-section-title"><span>ATHLETE SNAPSHOT</span><small>Private • stored on this device</small></div>
      <div class="lmf-profile-form-card">
        <div class="lmf-profile-form-grid compact">
          ${field('Age', 'age', context.age, { type:'number', inputmode:'numeric', placeholder:'Age' })}
          ${field('Height', 'height', context.height, { placeholder:'e.g. 5 ft 10 in' })}
          ${field('Default Load Unit', 'unit', unit, { placeholder:'lb or kg', hint:'Managed by your core athlete profile.' })}
          ${field('Training Experience', 'trainingExperience', context.trainingExperience, { placeholder:'e.g. Returning advanced lifter' })}
        </div>
        ${field('Training History', 'trainingHistory', context.trainingHistory, { textarea:true, placeholder:'Background, sports, previous training styles, major milestones.' })}
      </div>

      <div class="lmf-profile-section-title"><span>GOALS & DEVELOPMENT</span><small>What the coaching system should optimize for</small></div>
      <div class="lmf-profile-form-card">
        ${field('Primary Goal', 'primaryGoal', context.primaryGoal, { placeholder:'Your highest-priority outcome' })}
        ${field('Strength Goals', 'strengthGoals', context.strengthGoals, { textarea:true, placeholder:'Target lifts, performance standards, or strength outcomes.' })}
        ${field('Development Priorities', 'developmentPriorities', context.developmentPriorities, { textarea:true, placeholder:'Muscle groups, athletic qualities, technique, work capacity, resilience, etc.' })}
      </div>

      <div class="lmf-profile-section-title"><span>TRAINING PREFERENCES</span><small>Preserve the purpose, personalize the execution</small></div>
      <div class="lmf-profile-form-card">
        <div class="lmf-profile-form-grid">
          ${field('Preferred Exercises / Methods', 'preferredExercises', context.preferredExercises, { textarea:true, placeholder:'Movements and training methods you respond well to or enjoy.' })}
          ${field('Avoid / Dislike', 'avoidExercises', context.avoidExercises, { textarea:true, placeholder:'Movements you prefer not to use unless programming requires them.' })}
        </div>
        ${field('Equipment Available', 'equipment', context.equipment, { textarea:true, placeholder:'Rack, barbells, plates, dumbbells, kettlebells, sled, cables, machines, specialty equipment, etc.' })}
        ${field('Coaching Notes / Movement Considerations', 'coachingNotes', context.coachingNotes, { textarea:true, placeholder:'Anything LetMeFly should remember when explaining, substituting, or coaching a session.' })}
      </div>

      <div class="lmf-profile-section-title"><span>STRENGTH PROFILE</span><small>Read-only snapshot • edit in Strength Maxes / Training Maxes</small></div>
      <article class="lmf-profile-strength-card">
        ${strengthMarkup(strength, trackedTms)}
        <a class="lmf-profile-link" href="#/progress">VIEW STRENGTH & PROGRESS <b>›</b></a>
      </article>

      <div class="lmf-profile-savebar">
        <div><strong>Private Athlete Context</strong><small data-profile-save-status>${context.updatedAt ? `Last updated ${new Date(context.updatedAt).toLocaleDateString()}` : `${readinessCount ? `${readinessCount} readiness entr${readinessCount === 1 ? 'y' : 'ies'} • ` : ''}Ready to complete`}</small></div>
        <button type="button" data-action="save-profile-v2">SAVE ATHLETE CONTEXT</button>
      </div>`

    if (anchor.classList?.contains('profile-hero') && anchor.parentElement === root) anchor.insertAdjacentElement('afterend', section)
    else root.insertBefore(section, root.children[1] || null)
    bind(section, vault)
    expose(vault)
  }

  function collect(section, existing) {
    const read = (key) => text(section.querySelector(`[data-profile-key="${key}"]`)?.value)
    return {
      ...existing,
      age: read('age'),
      height: read('height'),
      trainingExperience: read('trainingExperience'),
      trainingHistory: read('trainingHistory'),
      primaryGoal: read('primaryGoal'),
      strengthGoals: read('strengthGoals'),
      developmentPriorities: read('developmentPriorities'),
      preferredExercises: read('preferredExercises'),
      avoidExercises: read('avoidExercises'),
      equipment: read('equipment'),
      coachingNotes: read('coachingNotes'),
      updatedAt: new Date().toISOString(),
      version: 2,
    }
  }

  async function saveContext(section, vault) {
    const status = section.querySelector('[data-profile-save-status]')
    const button = section.querySelector('[data-action="save-profile-v2"]')
    const next = collect(section, vault.context)
    const age = next.age ? Number(next.age) : null
    if (age != null && (!Number.isFinite(age) || age < 10 || age > 120)) {
      if (status) status.textContent = 'Enter a valid age or leave it blank.'
      section.querySelector('[data-profile-key="age"]')?.focus()
      return
    }

    button?.setAttribute('disabled', 'disabled')
    if (status) status.textContent = 'Saving privately…'
    try {
      const db = vault.db?.objectStoreNames?.contains('athletes') ? vault.db : await openPrivateDb()
      if (!db) throw new Error('Private athlete database unavailable')
      await new Promise((resolve, reject) => {
        try {
          const tx = db.transaction('athletes', 'readwrite')
          tx.objectStore('athletes').put({ ...vault.athlete, [CONTEXT_KEY]: next })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error || new Error('Profile save failed'))
          tx.onabort = () => reject(tx.error || new Error('Profile save aborted'))
        } catch (error) { reject(error) }
      })
      vault.context = next
      vault.athlete = { ...vault.athlete, [CONTEXT_KEY]: next }
      if (status) status.textContent = `Saved privately • ${new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}`
      const ring = section.querySelector('.lmf-profile-completion')
      const score = completionScore(vault.name, next)
      if (ring) {
        ring.style.setProperty('--profile-completion', `${score * 3.6}deg`)
        const strong = ring.querySelector('strong')
        if (strong) strong.textContent = `${score}%`
      }
      expose(vault)
      window.dispatchEvent(new CustomEvent('lmf:profile-v2-updated', { detail:{ athleteId:vault.athlete.id, updatedAt:next.updatedAt } }))
    } catch (_) {
      if (status) status.textContent = 'Could not save. Your existing athlete data was not changed.'
    } finally {
      button?.removeAttribute('disabled')
    }
  }

  function bind(section, vault) {
    const unit = section.querySelector('[data-profile-key="unit"]')
    if (unit) {
      unit.setAttribute('readonly', 'readonly')
      unit.setAttribute('aria-readonly', 'true')
    }
    section.querySelector('[data-action="save-profile-v2"]')?.addEventListener('click', () => void saveContext(section, vault))
  }

  function expose(vault) {
    window.__LMF_PROFILE_CONTEXT__ = {
      version: 2,
      athleteId: vault.athlete?.id || null,
      get: () => JSON.parse(JSON.stringify(vault.context || {})),
      storage: 'private-athlete-indexeddb',
    }
  }

  async function apply() {
    scanQueued = false
    if (rendering) return
    const anchor = profileHero()
    if (!anchor) {
      document.body.classList.remove(ROOT_CLASS)
      document.getElementById(SECTION_ID)?.remove()
      return
    }
    const root = profileRoot(anchor)
    if (!root) return
    document.body.classList.add(ROOT_CLASS)
    if (document.getElementById(SECTION_ID)) return
    rendering = true
    try {
      const vault = await readVault()
      if (!vault || !profileHero()) return
      renderDossier(vault, root, anchor)
    } finally { rendering = false }
  }

  function queue() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(() => void apply())
  }

  function boot() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList:true, subtree:true })
    window.addEventListener('hashchange', queue)
    window.addEventListener('popstate', queue)
    window.addEventListener('lmf:strength-maxes-updated', queue)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
