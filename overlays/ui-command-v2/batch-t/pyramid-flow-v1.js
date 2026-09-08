(() => {
  'use strict'

  // LetMeFly Pyramid Flow v1. Presentation only: existing set buttons remain the
  // persistence boundary, and no Crownforge prescription is rewritten here.
  const PYRAMID_PATTERN = /\bpyramid\b/i
  let timer = null

  const txt = (el) => (el?.textContent || '').trim()
  const rowsFor = (card) => [...card.querySelectorAll('.set-row[data-set-id]')]
  const isDone = (row) => row?.querySelector('.set-check')?.classList.contains('done') || false
  const value = (row, selector) => String(row?.querySelector(selector)?.value ?? '').trim() || '—'

  function normalizeKind(source) {
    const s = String(source || '').toLowerCase()
    if (/build[ -]?down|descending|descend/.test(s)) return 'BUILD DOWN'
    if (/up\s*\+\s*down|up[ -]?and[ -]?down|classic/.test(s)) return 'UP + DOWN'
    if (/build[ -]?up|ascending|ascend/.test(s)) return 'BUILD UP'
    if (/custom/.test(s)) return 'CUSTOM'
    return ''
  }

  function configFor(card) {
    const panel = card.closest('.workout-panel')
    const source = [
      card.dataset.setPattern,
      card.dataset.setStyle,
      card.dataset.pyramid,
      card.dataset.pyramidKind,
      panel?.dataset.setPattern,
      txt(card.querySelector('.exercise-title')),
      txt(card.querySelector('.exercise-notes')),
      txt(card.querySelector('.exercise-coaching')),
      txt(panel?.querySelector('.workout-panel-head')),
    ].filter(Boolean).join(' ')

    if (!PYRAMID_PATTERN.test(source)) return null
    return { kind: normalizeKind(source) || trendKind(card) }
  }

  function number(row, selector) {
    const n = Number.parseFloat(value(row, selector).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  function trendKind(card) {
    const loads = rowsFor(card).map((row) => number(row, '.load-input'))
    let up = false
    let down = false
    for (let i = 1; i < loads.length; i += 1) {
      if (loads[i - 1] == null || loads[i] == null) continue
      if (loads[i] > loads[i - 1]) up = true
      if (loads[i] < loads[i - 1]) down = true
    }
    if (up && down) return 'UP + DOWN'
    if (up) return 'BUILD UP'
    if (down) return 'BUILD DOWN'
    return 'CUSTOM'
  }

  function activeRow(card) {
    return card.querySelector('.set-row.lmf-set-active') || rowsFor(card).find((row) => !isDone(row)) || rowsFor(card)[0] || null
  }

  function ensureBadge(card, kind) {
    const title = card.querySelector('.exercise-title')
    if (!title) return
    let badge = title.querySelector('.lmf-pyramid-badge')
    if (!badge) {
      badge = document.createElement('div')
      badge.className = 'lmf-pyramid-badge'
      title.prepend(badge)
    }
    badge.replaceChildren()
    const label = document.createElement('strong')
    label.textContent = 'PYRAMID SET'
    const type = document.createElement('span')
    type.textContent = kind
    badge.append(label, type)
  }

  function makePlanRow(card, index) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lmf-pyramid-plan-row'
    button.setAttribute('aria-label', `Open pyramid set ${index + 1}`)

    const set = document.createElement('b')
    set.className = 'lmf-pyramid-plan-number'
    const reps = metric('REPS', 'lmf-pyramid-plan-reps')
    const load = metric('LOAD', 'lmf-pyramid-plan-load')
    const rpe = metric('RPE', 'lmf-pyramid-plan-rpe')
    const state = document.createElement('span')
    state.className = 'lmf-pyramid-plan-state'
    button.append(set, reps.wrap, load.wrap, rpe.wrap, state)

    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      card.querySelectorAll('.lmf-set-tab')[index]?.click()
    })
    return button
  }

  function metric(label, className) {
    const wrap = document.createElement('span')
    wrap.className = className
    const small = document.createElement('i')
    small.textContent = label
    const strong = document.createElement('strong')
    wrap.append(small, strong)
    return { wrap, strong }
  }

  function ensurePlan(card, kind) {
    const table = card.querySelector('.set-table')
    const rows = rowsFor(card)
    if (!table || rows.length < 2) return null

    let plan = table.querySelector(':scope > .lmf-pyramid-plan')
    if (!plan) {
      plan = document.createElement('section')
      plan.className = 'lmf-pyramid-plan'
      plan.setAttribute('aria-label', 'Pyramid plan')

      const head = document.createElement('header')
      head.className = 'lmf-pyramid-plan-head'
      const icon = document.createElement('span')
      icon.className = 'lmf-pyramid-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = '▲'
      const title = document.createElement('strong')
      title.textContent = 'PYRAMID PLAN'
      const meta = document.createElement('em')
      head.append(icon, title, meta)

      const list = document.createElement('div')
      list.className = 'lmf-pyramid-plan-list'
      plan.append(head, list)
      table.appendChild(plan)
    }

    const list = plan.querySelector('.lmf-pyramid-plan-list')
    if (list.children.length !== rows.length) {
      list.replaceChildren(...rows.map((_, index) => makePlanRow(card, index)))
    }
    plan.classList.toggle('is-long', rows.length > 10)
    plan.querySelector('.lmf-pyramid-plan-head em').textContent = `${kind} • ${rows.length} SETS`
    return plan
  }

  function update(card, kind) {
    const rows = rowsFor(card)
    const plan = ensurePlan(card, kind)
    if (!plan) return
    const active = activeRow(card)
    const currentIndex = Math.max(0, rows.indexOf(active))
    const items = [...plan.querySelectorAll('.lmf-pyramid-plan-row')]

    items.forEach((item, index) => {
      const row = rows[index]
      const done = isDone(row)
      const current = row === active
      item.classList.toggle('done', done)
      item.classList.toggle('current', current)
      item.querySelector('.lmf-pyramid-plan-number').textContent = String(index + 1)
      item.querySelector('.lmf-pyramid-plan-reps strong').textContent = value(row, '.reps-input')
      const load = value(row, '.load-input')
      item.querySelector('.lmf-pyramid-plan-load strong').textContent = load === '—' ? load : `${load} lb`
      item.querySelector('.lmf-pyramid-plan-rpe strong').textContent = value(row, '.rpe-input')
      item.querySelector('.lmf-pyramid-plan-state').textContent = done ? '✓' : current ? 'CURRENT' : '○'
    })

    const tabs = card.querySelector('.lmf-set-tabs')
    const tab = tabs?.children?.[currentIndex]
    if (tabs && tab && tabs.scrollWidth > tabs.clientWidth) {
      const left = tab.offsetLeft - (tabs.clientWidth - tab.clientWidth) / 2
      tabs.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    }

    if (plan.classList.contains('is-long')) {
      const list = plan.querySelector('.lmf-pyramid-plan-list')
      const item = items[currentIndex]
      if (list && item) {
        const top = item.offsetTop - (list.clientHeight - item.clientHeight) / 2
        list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      }
    }
  }

  function enhance(card) {
    if (!(card instanceof Element) || !card.matches('.active-exercise')) return
    const config = configFor(card)
    if (!config) return
    card.classList.add('lmf-pyramid-card')
    card.dataset.pyramidKind = config.kind
    ensureBadge(card, config.kind)
    update(card, config.kind)
  }

  function refresh() {
    timer = null
    document.querySelectorAll('.active-exercise').forEach(enhance)
  }

  function schedule() {
    if (timer != null) return
    timer = window.setTimeout(refresh, 50)
  }

  const observer = new MutationObserver(schedule)
  function start() {
    if (!document.body) return
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-set-pattern', 'data-set-style', 'data-pyramid', 'data-pyramid-kind'] })
    document.addEventListener('click', schedule, true)
    document.addEventListener('input', schedule, true)
    document.addEventListener('change', schedule, true)
    refresh()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
