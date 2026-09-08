(() => {
  'use strict'

  const STORAGE_KEY = 'letmefly_private_strength_maxes_v1'
  const SECTION_ID = 'lmf-strength-maxes'
  const PROGRESS_ID = 'lmf-strength-maxes-progress'
  const HISTORY_ID = 'lmf-max-history-dialog'
  const DEFAULT_UNIT = 'lb'

  const BASE_LIFTS = [
    { id: 'back_squat', name: 'Back Squat', aliases: ['back squat', 'squat'] },
    { id: 'front_squat', name: 'Front Squat', aliases: ['front squat'] },
    { id: 'bench_press', name: 'Bench Press', aliases: ['bench press', 'bench'] },
    { id: 'deadlift', name: 'Deadlift', aliases: ['deadlift'] },
    { id: 'ohp', name: 'Overhead Press', aliases: ['overhead press', 'ohp', 'shoulder press'] },
    { id: 'power_clean', name: 'Power Clean', aliases: ['power clean'] },
    { id: 'power_snatch', name: 'Power Snatch', aliases: ['power snatch'] },
  ]

  let state = loadState()
  let scanQueued = false
  let tmScanTimer = 0

  function emptyLift(name, unit = DEFAULT_UNIT) {
    return {
      name,
      unit,
      actual1rm: null,
      actualDate: '',
      allTimePr: null,
      prDate: '',
      estimated1rm: null,
      estimatedDate: '',
      estimateSource: null,
      notes: '',
      history: [],
    }
  }

  function initialState() {
    const lifts = {}
    BASE_LIFTS.forEach(lift => { lifts[lift.id] = emptyLift(lift.name) })
    return { version: 1, updatedAt: null, lifts, customOrder: [] }
  }

  function loadState() {
    const fresh = initialState()
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return fresh
      const saved = JSON.parse(raw)
      if (!saved || typeof saved !== 'object') return fresh
      const merged = { ...fresh, ...saved, lifts: { ...fresh.lifts, ...(saved.lifts || {}) } }
      Object.keys(merged.lifts).forEach(id => {
        const base = fresh.lifts[id] || emptyLift(merged.lifts[id]?.name || id)
        merged.lifts[id] = { ...base, ...merged.lifts[id], history: Array.isArray(merged.lifts[id]?.history) ? merged.lifts[id].history : [] }
      })
      merged.customOrder = Array.isArray(saved.customOrder) ? saved.customOrder : []
      return merged
    } catch (_) {
      return fresh
    }
  }

  function saveState(reason = 'update') {
    state.updatedAt = new Date().toISOString()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (_) {}
    exposeApi()
    window.dispatchEvent(new CustomEvent('lmf:strength-maxes-updated', { detail: { reason, updatedAt: state.updatedAt } }))
    refreshViews()
  }

  function exposeApi() {
    window.__LMF_STRENGTH_MAXES__ = {
      version: 1,
      get: () => JSON.parse(JSON.stringify(state)),
      storageKey: STORAGE_KEY,
      calculateE1RM,
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10)
  }

  function n(value) {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? num : null
  }

  function roundLoad(value, unit = DEFAULT_UNIT) {
    if (!Number.isFinite(value)) return null
    return unit === 'kg' ? Math.round(value * 2) / 2 : Math.round(value)
  }

  function toLb(value, unit) {
    return unit === 'kg' ? value * 2.2046226218 : value
  }

  function calculateE1RM(load, reps, unit = DEFAULT_UNIT) {
    const w = n(load)
    const r = Number(reps)
    if (!w || !Number.isFinite(r) || r < 1 || r > 15) return null
    if (r === 1) return roundLoad(w, unit)
    return roundLoad(w * (1 + r / 30), unit)
  }

  function historyEntry(liftId, type, value, date, extra = {}) {
    const lift = state.lifts[liftId]
    if (!lift || !value) return
    lift.history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      value,
      unit: lift.unit || DEFAULT_UNIT,
      date: date || today(),
      createdAt: new Date().toISOString(),
      ...extra,
    })
    lift.history = lift.history.slice(0, 100)
  }

  function formatLoad(value, unit) {
    const num = n(value)
    return num ? `${num} ${unit || DEFAULT_UNIT}` : '—'
  }

  function allLifts() {
    const base = BASE_LIFTS.map(x => ({ ...x, data: state.lifts[x.id] }))
    const customs = (state.customOrder || []).map(id => ({ id, name: state.lifts[id]?.name || id, aliases: [state.lifts[id]?.name || id], data: state.lifts[id] })).filter(x => x.data)
    return [...base, ...customs]
  }

  function liftMeta(id) {
    return allLifts().find(x => x.id === id)
  }

  function slugify(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `lift_${Date.now()}`
  }

  function addCustomLift() {
    const name = window.prompt('Exercise or lift name')
    if (!name || !name.trim()) return
    let id = `custom_${slugify(name)}`
    let suffix = 2
    while (state.lifts[id]) id = `custom_${slugify(name)}_${suffix++}`
    state.lifts[id] = emptyLift(name.trim())
    state.customOrder.push(id)
    saveState('custom-lift-added')
  }

  function removeCustomLift(id) {
    if (!id.startsWith('custom_') || !state.lifts[id]) return
    if (!window.confirm(`Remove ${state.lifts[id].name} from Strength Maxes? Its local max history will also be removed.`)) return
    delete state.lifts[id]
    state.customOrder = state.customOrder.filter(x => x !== id)
    saveState('custom-lift-removed')
  }

  function findExistingTm(meta) {
    const candidates = [...document.querySelectorAll('input[type="number"],input[inputmode="decimal"],input[inputmode="numeric"]')]
    let best = null
    let bestScore = 0
    for (const input of candidates) {
      if (input.closest(`#${SECTION_ID}`)) continue
      const parent = input.closest('label,.field,.form-field,.setting-row,.card,.panel,.section,div')
      const text = `${input.name || ''} ${input.id || ''} ${input.getAttribute('aria-label') || ''} ${parent?.textContent || ''}`.toLowerCase()
      if (!/(training\s*max|\btm\b)/i.test(text)) continue
      const alias = meta.aliases.find(a => text.includes(a.toLowerCase()))
      if (!alias) continue
      const score = alias.length + (/training\s*max/i.test(text) ? 20 : 0)
      if (score > bestScore) { best = input; bestScore = score }
    }
    return best
  }

  function currentTm(meta) {
    const field = findExistingTm(meta)
    const value = field ? n(field.value) : null
    if (!value) return null
    const context = `${field.getAttribute('aria-label') || ''} ${field.closest('label,.field,.form-field,.setting-row,.card,.panel,div')?.textContent || ''}`.toLowerCase()
    const unit = /\bkg\b|kilogram/.test(context) ? 'kg' : /\blb\b|pound/.test(context) ? 'lb' : state.lifts[meta.id]?.unit || DEFAULT_UNIT
    return { value, unit, field }
  }

  function profileContainer() {
    const tmText = [...document.querySelectorAll('h1,h2,h3,h4,legend,strong,.section-title,.card-title')].find(el => /training\s*max/i.test((el.textContent || '').trim()) && isVisible(el))
    if (tmText) {
      const card = tmText.closest('.card,.panel,section,fieldset,.settings-section')
      if (card?.parentElement) return { parent: card.parentElement, after: card }
    }
    const heading = [...document.querySelectorAll('h1,h2,h3')].find(el => /^profile$/i.test((el.textContent || '').trim()) && isVisible(el))
    if (!heading) return null
    const root = heading.closest('main,[role="main"],section,.page,.view,.screen,.tab-panel') || heading.parentElement
    if (!root) return null
    return { parent: root, after: null }
  }

  function progressContainer() {
    const heading = [...document.querySelectorAll('h1,h2,h3')].find(el => /^progress$/i.test((el.textContent || '').trim()) && isVisible(el))
    if (!heading) return null
    const root = heading.closest('main,[role="main"],section,.page,.view,.screen,.tab-panel') || heading.parentElement
    return root || null
  }

  function isVisible(el) {
    if (!el?.isConnected) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return el.getClientRects().length > 0
  }

  function metric(label, value, className = '') {
    return `<span class="lmf-max-metric ${className}"><small>${label}</small><strong>${value}</strong></span>`
  }

  function liftSummary(meta) {
    const d = state.lifts[meta.id]
    const tm = currentTm(meta)
    return [
      metric('ACTUAL', formatLoad(d.actual1rm, d.unit)),
      metric('TM', tm ? formatLoad(tm.value, tm.unit) : 'PROFILE', 'is-tm'),
      metric('e1RM', formatLoad(d.estimated1rm, d.unit), 'is-estimate'),
      metric('ALL-TIME', formatLoad(d.allTimePr, d.unit), 'is-pr'),
    ].join('')
  }

  function liftCard(meta) {
    const d = state.lifts[meta.id]
    const tm = currentTm(meta)
    const source = d.estimateSource
      ? `Best logged estimate: ${source.load} ${source.unit} × ${source.reps}${source.rpe ? ` @ RPE ${source.rpe}` : ''}`
      : 'Estimated 1RM updates from qualifying logged working sets when LetMeFly can read the set data.'
    return `
      <details class="lmf-max-card" data-max-lift="${meta.id}">
        <summary>
          <span class="lmf-max-name">${escapeHtml(meta.name)}</span>
          <span class="lmf-max-summary-metrics">${liftSummary(meta)}</span>
        </summary>
        <div class="lmf-max-body">
          <div class="lmf-max-grid">
            <label><span>Actual 1RM</span><input type="number" min="0" step="0.5" inputmode="decimal" data-max-field="actual1rm" value="${d.actual1rm ?? ''}" placeholder="Enter tested max"></label>
            <label><span>Date achieved</span><input type="date" data-max-field="actualDate" value="${escapeAttr(d.actualDate || '')}"></label>
            <label><span>All-time PR</span><input type="number" min="0" step="0.5" inputmode="decimal" data-max-field="allTimePr" value="${d.allTimePr ?? ''}" placeholder="Best ever"></label>
            <label><span>PR date</span><input type="date" data-max-field="prDate" value="${escapeAttr(d.prDate || '')}"></label>
            <label><span>Unit</span><select data-max-field="unit"><option value="lb" ${d.unit === 'lb' ? 'selected' : ''}>lb</option><option value="kg" ${d.unit === 'kg' ? 'selected' : ''}>kg</option></select></label>
            <div class="lmf-max-readonly"><span>Training Max</span><strong data-max-tm>${tm ? formatLoad(tm.value, tm.unit) : 'Use existing Profile TM'}</strong><small>Program TM stays managed by LetMeFly's existing Training Max field.</small></div>
            <div class="lmf-max-readonly is-estimate"><span>Estimated 1RM</span><strong>${formatLoad(d.estimated1rm, d.unit)}</strong><small>${escapeHtml(source)}</small></div>
          </div>
          <div class="lmf-max-estimator">
            <span>Estimate from a set</span>
            <div><input type="number" min="0" step="0.5" inputmode="decimal" data-est-load placeholder="Load"><input type="number" min="1" max="15" step="1" inputmode="numeric" data-est-reps placeholder="Reps"><button type="button" data-est-calc>CALCULATE e1RM</button></div>
          </div>
          <label class="lmf-max-notes"><span>Max notes</span><textarea rows="2" data-note-field="strength-max-notes" data-max-field="notes" placeholder="Testing notes, technique, conditions, equipment…">${escapeHtml(d.notes || '')}</textarea></label>
          <div class="lmf-max-actions">
            <button type="button" data-max-history>VIEW MAX HISTORY</button>
            ${meta.id.startsWith('custom_') ? '<button type="button" class="is-danger" data-max-remove>REMOVE LIFT</button>' : ''}
          </div>
        </div>
      </details>`
  }

  function buildProfileSection() {
    const section = document.createElement('section')
    section.id = SECTION_ID
    section.className = 'lmf-strength-maxes-section'
    section.innerHTML = `
      <div class="lmf-max-section-head">
        <div><span class="lmf-max-kicker">ATHLETE PROFILE</span><h2>STRENGTH MAXES</h2><p>Keep tested strength separate from the Training Max used by your program. Estimated 1RM is informational and never changes programming automatically.</p></div>
        <button type="button" data-max-add>+ ADD LIFT</button>
      </div>
      <div class="lmf-max-legend"><span><b>Actual 1RM</b> tested current max</span><span><b>TM</b> program loading reference</span><span><b>e1RM</b> estimated from logged sets</span><span><b>All-time PR</b> historical best</span></div>
      <div class="lmf-max-list">${allLifts().map(liftCard).join('')}</div>`
    bindProfile(section)
    return section
  }

  function bindProfile(section) {
    section.querySelector('[data-max-add]')?.addEventListener('click', addCustomLift)
    section.querySelectorAll('[data-max-lift]').forEach(card => {
      const id = card.getAttribute('data-max-lift')
      const d = state.lifts[id]
      card.querySelectorAll('[data-max-field]').forEach(input => {
        input.addEventListener('change', () => {
          const field = input.getAttribute('data-max-field')
          const oldValue = d[field]
          let value = input.value
          if (['actual1rm', 'allTimePr'].includes(field)) value = n(value)
          d[field] = value
          if (field === 'actual1rm' && value && value !== oldValue) {
            if (!d.actualDate) d.actualDate = today()
            historyEntry(id, 'actual_1rm', value, d.actualDate, { source: 'manual-entry' })
          }
          if (field === 'allTimePr' && value && value !== oldValue) {
            if (!d.prDate) d.prDate = today()
            historyEntry(id, 'all_time_pr', value, d.prDate, { source: 'manual-entry' })
          }
          saveState(`max-${field}`)
        })
      })
      card.querySelector('[data-est-calc]')?.addEventListener('click', () => {
        const load = n(card.querySelector('[data-est-load]')?.value)
        const reps = Number(card.querySelector('[data-est-reps]')?.value)
        const estimate = calculateE1RM(load, reps, d.unit)
        if (!estimate) return showToast('Enter a load and 1–15 reps to calculate e1RM.', 'error')
        recordEstimate(id, estimate, { load, reps, unit: d.unit, source: 'manual-calculator' })
        showToast(`Estimated 1RM: ${estimate} ${d.unit}`)
      })
      card.querySelector('[data-max-history]')?.addEventListener('click', () => showHistory(id))
      card.querySelector('[data-max-remove]')?.addEventListener('click', () => removeCustomLift(id))
    })
  }

  function recordEstimate(id, estimate, source) {
    const d = state.lifts[id]
    if (!d || !estimate) return
    const existingLb = d.estimated1rm ? toLb(d.estimated1rm, d.unit) : 0
    const candidateLb = toLb(estimate, source.unit || d.unit)
    if (candidateLb + 0.01 < existingLb) return
    let stored = estimate
    if ((source.unit || d.unit) !== d.unit) stored = d.unit === 'lb' ? roundLoad(candidateLb, 'lb') : roundLoad(candidateLb / 2.2046226218, 'kg')
    const changed = stored !== d.estimated1rm
    d.estimated1rm = stored
    d.estimatedDate = today()
    d.estimateSource = { ...source, estimate: stored, unit: source.unit || d.unit, capturedAt: new Date().toISOString() }
    if (changed) historyEntry(id, 'estimated_1rm', stored, d.estimatedDate, { source: source.source || 'logged-set', reps: source.reps, load: source.load, rpe: source.rpe || null })
    saveState('estimated-1rm')
  }

  function showHistory(id) {
    document.getElementById(HISTORY_ID)?.remove()
    const meta = liftMeta(id)
    const d = state.lifts[id]
    if (!meta || !d) return
    const entries = d.history.length ? d.history.map(item => {
      const label = item.type === 'actual_1rm' ? 'Actual 1RM' : item.type === 'all_time_pr' ? 'All-time PR' : 'Estimated 1RM'
      const details = item.load && item.reps ? `<small>${item.load} ${item.unit} × ${item.reps}${item.rpe ? ` @ RPE ${item.rpe}` : ''}</small>` : ''
      return `<li><time>${escapeHtml(item.date || '')}</time><div><strong>${label}: ${formatLoad(item.value, item.unit)}</strong>${details}</div></li>`
    }).join('') : '<li class="is-empty">No max history yet.</li>'
    const dialog = document.createElement('div')
    dialog.id = HISTORY_ID
    dialog.className = 'lmf-max-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.innerHTML = `<div class="lmf-max-dialog-card"><header><div><span>MAX HISTORY</span><h3>${escapeHtml(meta.name)}</h3></div><button type="button" aria-label="Close max history">×</button></header><ul>${entries}</ul></div>`
    const close = () => dialog.remove()
    dialog.addEventListener('click', e => { if (e.target === dialog) close() })
    dialog.querySelector('header button')?.addEventListener('click', close)
    document.body.appendChild(dialog)
  }

  function buildProgressSection() {
    const section = document.createElement('section')
    section.id = PROGRESS_ID
    section.className = 'lmf-strength-maxes-progress'
    section.innerHTML = `<div class="lmf-max-progress-head"><div><span>STRENGTH</span><h2>MAXES & ESTIMATES</h2></div><small>Actual • TM • e1RM • PR</small></div><div class="lmf-max-progress-grid">${allLifts().map(meta => `<article><h3>${escapeHtml(meta.name)}</h3><div>${liftSummary(meta)}</div></article>`).join('')}</div>`
    return section
  }

  function refreshViews() {
    const profile = document.getElementById(SECTION_ID)
    if (profile) {
      const openIds = [...profile.querySelectorAll('details[open]')].map(x => x.getAttribute('data-max-lift'))
      const replacement = buildProfileSection()
      profile.replaceWith(replacement)
      openIds.forEach(id => replacement.querySelector(`[data-max-lift="${CSS.escape(id)}"]`)?.setAttribute('open', ''))
    }
    const progress = document.getElementById(PROGRESS_ID)
    if (progress) progress.replaceWith(buildProgressSection())
  }

  function insertViews() {
    if (!document.getElementById(SECTION_ID)) {
      const target = profileContainer()
      if (target) {
        const section = buildProfileSection()
        if (target.after?.parentElement === target.parent) target.after.insertAdjacentElement('afterend', section)
        else target.parent.appendChild(section)
      }
    }
    if (!document.getElementById(PROGRESS_ID)) {
      const progress = progressContainer()
      if (progress) progress.appendChild(buildProgressSection())
    }
    scheduleTmRefresh()
  }

  function scheduleTmRefresh() {
    window.clearTimeout(tmScanTimer)
    tmScanTimer = window.setTimeout(() => {
      document.querySelectorAll(`#${SECTION_ID} [data-max-lift]`).forEach(card => {
        const id = card.getAttribute('data-max-lift')
        const meta = liftMeta(id)
        const tm = meta ? currentTm(meta) : null
        const target = card.querySelector('[data-max-tm]')
        if (target) target.textContent = tm ? formatLoad(tm.value, tm.unit) : 'Use existing Profile TM'
      })
    }, 120)
  }

  function normalizeExerciseName(text) {
    return String(text || '').toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9+\- ]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function identifyLift(name) {
    const clean = normalizeExerciseName(name)
    if (!clean) return null
    const metas = allLifts().sort((a, b) => Math.max(...b.aliases.map(x => x.length)) - Math.max(...a.aliases.map(x => x.length)))
    return metas.find(meta => meta.aliases.some(alias => clean.includes(normalizeExerciseName(alias)))) || null
  }

  function textOf(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function findExerciseName(context) {
    const direct = context?.getAttribute?.('data-exercise-name') || context?.closest?.('[data-exercise-name]')?.getAttribute('data-exercise-name')
    if (direct) return direct
    const container = context?.closest?.('[data-exercise],.exercise-card,.workout-exercise,.lmf-flow-panel,.lmf-flow-node,.card,.panel') || context?.parentElement
    if (!container) return ''
    const named = container.querySelector('[data-exercise-name],.exercise-name,.exercise-title,.lmf-exercise-title,h2,h3,h4,strong')
    return named?.getAttribute?.('data-exercise-name') || textOf(named)
  }

  function findNumeric(container, pattern) {
    if (!container) return null
    const inputs = [...container.querySelectorAll('input[type="number"],input[inputmode="numeric"],input[inputmode="decimal"]')]
    for (const input of inputs) {
      const txt = `${input.name || ''} ${input.id || ''} ${input.getAttribute('aria-label') || ''} ${input.getAttribute('placeholder') || ''} ${input.closest('label,.field,.set-cell,div')?.textContent || ''}`
      if (pattern.test(txt)) {
        const val = Number(input.value)
        if (Number.isFinite(val) && val > 0) return val
      }
    }
    return null
  }

  function captureSetFromClick(target) {
    const button = target?.closest?.('button,[role="button"]')
    if (!button) return null
    const buttonText = `${textOf(button)} ${button.getAttribute('aria-label') || ''} ${button.className || ''}`
    if (!/(complete|completed|save|log|check|done|finish|set)/i.test(buttonText)) return null
    const row = button.closest('.set-row,.lmf-set-active,[data-set],.set-card,.exercise-card,.workout-exercise,.lmf-flow-panel,.card') || button.parentElement
    const exerciseName = findExerciseName(row || button)
    const meta = identifyLift(exerciseName)
    if (!meta) return null
    const reps = findNumeric(row, /\b(rep|reps|repetition)/i)
    const load = findNumeric(row, /\b(load|weight|lb|kg)/i)
    const rpe = findNumeric(row, /\brpe\b/i)
    if (!reps || !load || reps > 15) return null
    const contextText = textOf(row).toLowerCase()
    const unit = /\bkg\b|kilogram/.test(contextText) ? 'kg' : /\blb\b|pound/.test(contextText) ? 'lb' : state.lifts[meta.id]?.unit || DEFAULT_UNIT
    return { id: meta.id, reps, load, rpe, unit, source: 'logged-set' }
  }

  function onDocumentClick(event) {
    const captured = captureSetFromClick(event.target)
    if (!captured) return
    const estimate = calculateE1RM(captured.load, captured.reps, captured.unit)
    if (!estimate) return
    window.setTimeout(() => recordEstimate(captured.id, estimate, captured), 80)
  }

  function ensureToast() {
    let toast = document.querySelector('.lmf-max-toast')
    if (toast) return toast
    toast = document.createElement('div')
    toast.className = 'lmf-max-toast'
    toast.setAttribute('role', 'status')
    toast.setAttribute('aria-live', 'polite')
    document.body.appendChild(toast)
    return toast
  }

  function showToast(message, kind = '') {
    const toast = ensureToast()
    toast.textContent = message
    toast.dataset.kind = kind
    toast.classList.add('is-visible')
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600)
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]))
  }

  function escapeAttr(value) { return escapeHtml(value) }

  function queueScan() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(() => {
      scanQueued = false
      insertViews()
    })
  }

  function boot() {
    exposeApi()
    queueScan()
    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('input', scheduleTmRefresh, true)
    document.addEventListener('change', scheduleTmRefresh, true)
    new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
