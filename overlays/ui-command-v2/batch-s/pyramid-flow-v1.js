(() => {
  'use strict'

  // LetMeFly Pyramid Flow v1
  // Presentation only. The existing workout rows, inputs, completion buttons,
  // and persisted program data remain authoritative.

  const PYRAMID_TEXT = /\bpyramid\b/i
  let refreshTimer = null

  const style = document.createElement('style')
  style.id = 'lmf-pyramid-flow-v1-style'
  style.textContent = `
    .lmf-pyramid-card .lmf-pyramid-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 8px;padding:0 2px}.lmf-pyramid-title{display:flex;align-items:center;gap:8px;color:#ff3850;font-family:var(--condensed);font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.lmf-pyramid-title::before{content:'▲';font-size:16px}.lmf-pyramid-meta{color:#9aa7b5;font-size:10px;font-weight:750;white-space:nowrap}.lmf-pyramid-badge{display:inline-flex;align-items:center;min-height:24px;margin:0 0 8px;padding:4px 9px;border:1px solid #8e2433;border-radius:999px;color:#ff8895;background:#291017;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.lmf-pyramid-plan{margin-top:12px;border:1px solid #2f3d48;border-radius:13px;overflow:hidden;background:#071017}.lmf-pyramid-plan-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px;border-bottom:1px solid #293641}.lmf-pyramid-plan-head b{color:#f4f7fa;font-family:var(--condensed);font-size:16px}.lmf-pyramid-plan-head small{color:#8f9ba7;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.lmf-pyramid-plan-scroll{max-height:310px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.lmf-pyramid-row{display:grid;grid-template-columns:32px minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr) 28px;align-items:center;gap:7px;min-height:43px;padding:6px 10px;border-bottom:1px solid #18242e;color:#9aa7b3;font-size:11px}.lmf-pyramid-row:last-child{border-bottom:0}.lmf-pyramid-row strong{color:#f2f5f7;font-family:var(--condensed);font-size:16px}.lmf-pyramid-row span{text-align:center}.lmf-pyramid-row .lmf-pyramid-status{display:grid;place-items:center;width:22px;height:22px;border:1px solid #42515e;border-radius:50%;font-size:11px}.lmf-pyramid-row.done{color:#78cfa3;background:#081a14}.lmf-pyramid-row.done .lmf-pyramid-status{border-color:#2b7654;color:#9ce9c1;background:#0c2a1d}.lmf-pyramid-row.active{color:#fff;background:linear-gradient(90deg,#421019,#1b0d12);box-shadow:inset 3px 0 #ff1731}.lmf-pyramid-row.active .lmf-pyramid-status{border-color:#ff1731;color:#fff}.lmf-pyramid-row-labels{display:grid;grid-template-columns:32px minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr) 28px;gap:7px;padding:7px 10px;color:#71808d;background:#09131b;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.lmf-pyramid-row-labels span{text-align:center}.lmf-pyramid-row-labels span:first-child{text-align:left}@media(max-width:430px){.lmf-pyramid-meta{font-size:9px}.lmf-pyramid-row{grid-template-columns:28px 1fr 1fr .8fr 24px;padding-inline:8px}.lmf-pyramid-row-labels{grid-template-columns:28px 1fr 1fr .8fr 24px;padding-inline:8px}}
  `
  if (!document.getElementById(style.id)) document.head.appendChild(style)

  function text(element) {
    return (element?.textContent || '').trim()
  }

  function rowsFor(card) {
    return [...card.querySelectorAll('.set-row[data-set-id]')]
  }

  function isDone(row) {
    return row?.querySelector('.set-check')?.classList.contains('done') || false
  }

  function inputValue(row, selector) {
    const value = row?.querySelector(selector)?.value
    return value == null ? '' : String(value).trim()
  }

  function numeric(row, selector) {
    const value = Number.parseFloat(inputValue(row, selector))
    return Number.isFinite(value) ? value : null
  }

  function explicitPyramid(card) {
    if (card.matches('[data-set-style="pyramid"],[data-workout-style="pyramid"],[data-pyramid]')) return true
    const panel = card.closest('.workout-panel')
    const source = [
      text(card.querySelector('.exercise-title')),
      text(card.querySelector('.exercise-note')),
      text(panel?.querySelector('.workout-panel-head')),
      card.getAttribute('data-set-style') || '',
      card.getAttribute('data-workout-style') || '',
    ].join(' ')
    return PYRAMID_TEXT.test(source)
  }

  function direction(values) {
    const clean = values.filter((value) => value != null)
    if (clean.length < 3) return 'CUSTOM'
    let up = false
    let down = false
    for (let index = 1; index < clean.length; index += 1) {
      if (clean[index] > clean[index - 1]) up = true
      if (clean[index] < clean[index - 1]) down = true
    }
    if (up && down) return 'UP + DOWN'
    if (up) return 'BUILD UP'
    if (down) return 'BUILD DOWN'
    return 'CUSTOM'
  }

  function pyramidType(card) {
    const declared = card.getAttribute('data-pyramid-type') || card.closest('.workout-panel')?.getAttribute('data-pyramid-type')
    if (declared) return declared.replace(/[-_]/g, ' ').toUpperCase()
    const rows = rowsFor(card)
    const loads = rows.map((row) => numeric(row, '.load-input'))
    const reps = rows.map((row) => numeric(row, '.reps-input'))
    const loadDirection = direction(loads)
    if (loadDirection !== 'CUSTOM') return loadDirection
    const repDirection = direction(reps)
    return repDirection === 'BUILD UP' ? 'BUILD DOWN' : repDirection === 'BUILD DOWN' ? 'BUILD UP' : 'CUSTOM'
  }

  function selectedRow(card) {
    return card.querySelector('.set-row.lmf-set-active') || rowsFor(card).find((row) => !isDone(row)) || rowsFor(card).at(-1) || null
  }

  function ensureBadge(card, type) {
    const title = card.querySelector('.exercise-title')
    if (!title) return
    let badge = title.querySelector('.lmf-pyramid-badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'lmf-pyramid-badge'
      title.appendChild(badge)
    }
    badge.textContent = `PYRAMID SET · ${type}`
  }

  function ensurePlan(card) {
    const table = card.querySelector('.set-table')
    const rows = rowsFor(card)
    if (!table || rows.length < 2) return null

    let plan = table.querySelector(':scope > .lmf-pyramid-plan')
    if (!plan) {
      plan = document.createElement('section')
      plan.className = 'lmf-pyramid-plan'
      plan.setAttribute('aria-label', 'Pyramid plan')
      plan.innerHTML = `
        <div class="lmf-pyramid-plan-head"><b>Pyramid Plan</b><small></small></div>
        <div class="lmf-pyramid-row-labels"><span>Set</span><span>Reps</span><span>Load</span><span>RPE</span><span></span></div>
        <div class="lmf-pyramid-plan-scroll"></div>
      `
      table.appendChild(plan)
    }
    return plan
  }

  function updatePlan(card) {
    if (!explicitPyramid(card)) return
    const rows = rowsFor(card)
    if (rows.length < 2) return
    card.classList.add('lmf-pyramid-card')

    const type = pyramidType(card)
    ensureBadge(card, type)
    const plan = ensurePlan(card)
    if (!plan) return

    const active = selectedRow(card)
    plan.querySelector('.lmf-pyramid-plan-head small').textContent = `${rows.length} SETS · ${type}`
    const scroll = plan.querySelector('.lmf-pyramid-plan-scroll')
    scroll.replaceChildren()

    rows.forEach((row, index) => {
      const item = document.createElement('div')
      item.className = 'lmf-pyramid-row'
      if (row === active) item.classList.add('active')
      if (isDone(row)) item.classList.add('done')
      const reps = inputValue(row, '.reps-input') || '—'
      const load = inputValue(row, '.load-input') || '—'
      const rpe = inputValue(row, '.rpe-input') || '—'
      item.innerHTML = `<strong>${index + 1}</strong><span>${reps}</span><span>${load === '—' ? load : `${load} lb`}</span><span>${rpe}</span><span class="lmf-pyramid-status">${isDone(row) ? '✓' : row === active ? '●' : '○'}</span>`
      item.addEventListener('click', () => {
        const tab = card.querySelectorAll('.lmf-set-tab')[index]
        if (tab instanceof HTMLElement) tab.click()
      })
      scroll.appendChild(item)
    })

    window.requestAnimationFrame(() => {
      scroll.querySelector('.lmf-pyramid-row.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const activeTab = card.querySelector('.lmf-set-tab.active')
      activeTab?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    })
  }

  function enhanceAll(root = document) {
    const scope = root instanceof Element ? root : document
    scope.querySelectorAll('.active-exercise').forEach(updatePlan)
  }

  function schedule(delay = 0) {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => enhanceAll(document), delay)
  }

  function start() {
    enhanceAll(document)
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length || mutation.type === 'attributes')) schedule(0)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] })
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.closest('.lmf-set-tab,.set-check,.lmf-step-btn')) schedule(80)
    }, true)
    document.addEventListener('input', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.lmf-pyramid-card')) schedule(80)
    }, true)
    window.addEventListener('hashchange', () => schedule(0))
    window.setTimeout(() => enhanceAll(document), 350)
    window.setTimeout(() => enhanceAll(document), 1200)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
