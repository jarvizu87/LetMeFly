(() => {
  'use strict'

  // LetMeFly Workout Logging v2
  // Logging ergonomics only. Existing LetMeFly set buttons remain the authoritative
  // persistence boundary. Program-prescribed percentage/fixed loads always win.

  const GROUP_CLASS = /lmf-flow-(?:circuit|superset|tri-set|giant-set)/
  const PRESCRIBED_PATTERN = /(?:\b\d+(?:\.\d+)?\s*%\b|\bpercent(?:age)?\b|\btraining\s*max\b|\bTM\b|\b\d+(?:\.\d+)?\s*(?:lb|lbs|kg|kgs)\b|\bbody\s*weight\b|\bbodyweight\b|\bBW\b)/i
  let refreshTimer = 0
  let userIsEditing = false

  const text = node => (node?.textContent || '').trim()
  const rowsFor = card => [...card.querySelectorAll('.set-row[data-set-id]')]
  const isDone = row => Boolean(row?.querySelector('.set-check')?.classList.contains('done'))
  const inputValue = (row, selector) => String(row?.querySelector(selector)?.value ?? '').trim()

  function exerciseKey(card) {
    return card?.dataset.exerciseId || card?.getAttribute('data-exercise-art') || text(card?.querySelector('.exercise-title h3'))
  }

  function setNumber(row, fallback = 1) {
    const raw = text(row?.querySelector('.set-label strong'))
    const match = raw.match(/\d+/)
    return match ? Number(match[0]) : fallback
  }

  function grouped(panel) {
    return [...panel?.classList || []].some(name => GROUP_CLASS.test(name))
  }

  function rowPrescriptionText(row, card) {
    const attrs = [...(row?.attributes || [])].map(attr => `${attr.name}=${attr.value}`).join(' ')
    const target = text(row?.querySelector('.set-target-cell'))
    const loadSmall = text(row?.querySelector('.load-field small'))
    const title = text(card?.querySelector('.exercise-title'))
    return `${attrs} ${target} ${loadSmall} ${title}`
  }

  function protectedProgramLoad(row, card) {
    // A non-empty target load is already authoritative whether it came from a
    // percentage/TM calculation or an explicit fixed prescription.
    if (inputValue(row, '.load-input')) return true
    return PRESCRIBED_PATTERN.test(rowPrescriptionText(row, card))
  }

  function previousActualLoad(card, targetRow) {
    const rows = rowsFor(card)
    const targetIndex = rows.indexOf(targetRow)
    if (targetIndex <= 0) return ''
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (!isDone(row)) continue
      const load = inputValue(row, '.load-input')
      if (load) return load
    }
    return ''
  }

  function carryLoadIfAllowed(card, row) {
    if (!card || !row || protectedProgramLoad(row, card)) return false
    const load = previousActualLoad(card, row)
    if (!load) return false
    const input = row.querySelector('.load-input')
    if (!(input instanceof HTMLInputElement) || input.value.trim()) return false
    input.value = load
    input.dataset.lmfCarriedLoad = 'true'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    markCarryNote(row, load)
    return true
  }

  function markCarryNote(row, load) {
    let note = row.querySelector('.lmf-load-carry-note')
    if (!note) {
      note = document.createElement('small')
      note.className = 'lmf-load-carry-note'
      const field = row.querySelector('.load-field')
      field?.appendChild(note)
    }
    if (note) note.textContent = `${load} carried from your previous set — adjust if needed`
  }

  function firstIncompleteRow(card) {
    return rowsFor(card).find(row => !isDone(row)) || null
  }

  function currentRound(panel) {
    const incomplete = []
    panel.querySelectorAll('.active-exercise').forEach(card => {
      rowsFor(card).forEach((row, index) => {
        if (!isDone(row)) incomplete.push(setNumber(row, index + 1))
      })
    })
    return incomplete.length ? Math.min(...incomplete) : null
  }

  function rowForRound(card, round) {
    return rowsFor(card).find((row, index) => setNumber(row, index + 1) === round) || null
  }

  function authoritativeVisualTarget(panel) {
    if (!panel || panel.classList.contains('lmf-flow-resting')) return null
    const active = panel.querySelector('.active-exercise.lmf-sequence-active')
    if (!(active instanceof Element)) return null
    if (grouped(panel)) {
      const round = currentRound(panel)
      return { card: active, row: round == null ? firstIncompleteRow(active) : rowForRound(active, round) || firstIncompleteRow(active) }
    }
    return { card: active, row: firstIncompleteRow(active) }
  }

  function activateRow(card, row, shouldScroll = true) {
    if (!card || !row) return false
    carryLoadIfAllowed(card, row)
    const rows = rowsFor(card)
    const index = rows.indexOf(row)
    const tab = card.querySelectorAll('.lmf-set-tab')[index]
    if (tab instanceof HTMLButtonElement && !tab.classList.contains('active')) tab.click()
    row.classList.add('lmf-set-active')
    card.classList.add('lmf-logging-compact')
    card.dataset.lmfLoggingActive = 'true'
    if (shouldScroll && !userIsEditing) {
      window.setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    }
    return true
  }

  function autoAdvance(panel, shouldScroll = true) {
    const target = authoritativeVisualTarget(panel)
    if (!target?.row) return false
    return activateRow(target.card, target.row, shouldScroll)
  }

  function ensureDetailToggle(card) {
    if (!card || card.querySelector(':scope > .lmf-log-detail-toggle')) return
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'lmf-log-detail-toggle'
    toggle.textContent = 'EXERCISE DETAILS'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      const expanded = card.classList.toggle('lmf-logging-details-open')
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      toggle.textContent = expanded ? 'HIDE DETAILS' : 'EXERCISE DETAILS'
    })
    const table = card.querySelector('.set-table')
    table?.insertAdjacentElement('beforebegin', toggle)
  }

  function enhanceCard(card) {
    if (!(card instanceof Element) || !card.matches('.active-exercise.lmf-workout-flow-card')) return
    ensureDetailToggle(card)
    card.querySelectorAll('.load-input[data-lmf-carried-load="true"]').forEach(input => {
      const row = input.closest('.set-row')
      if (row && !row.querySelector('.lmf-load-carry-note')) markCarryNote(row, input.value)
    })
  }

  function enhanceAll() {
    refreshTimer = 0
    document.querySelectorAll('.active-exercise.lmf-workout-flow-card').forEach(enhanceCard)
  }

  function schedule(delay = 0) {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(enhanceAll, delay)
  }

  function afterAuthoritativeToggle(check, row, card, panel) {
    // Let the native toggle/persistence handler and Workout Flow v1 finish first.
    const settle = delay => window.setTimeout(() => {
      if (!row.isConnected || !card.isConnected) return
      const done = isDone(row)
      if (done) card.classList.add('lmf-logging-compact')
      if (!panel?.isConnected) return
      autoAdvance(panel, delay >= 120)
      enhanceAll()
    }, delay)
    settle(20)
    settle(140)
    settle(380)
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const rest = target.closest('[data-lmf-rest-continue]')
    if (rest) {
      const panel = rest.closest('.workout-panel')
      window.setTimeout(() => autoAdvance(panel, true), 40)
      window.setTimeout(() => autoAdvance(panel, true), 180)
      return
    }

    const check = target.closest('.set-check[data-action="toggle-set"]')
    if (check) {
      const row = check.closest('.set-row')
      const card = check.closest('.active-exercise')
      const panel = check.closest('.workout-panel')
      if (row && card) afterAuthoritativeToggle(check, row, card, panel)
      return
    }

    const setTab = target.closest('.lmf-set-tab')
    if (setTab) {
      const card = setTab.closest('.active-exercise')
      if (card) {
        card.classList.add('lmf-logging-compact')
        window.setTimeout(() => {
          const row = card.querySelector('.set-row.lmf-set-active')
          if (row) carryLoadIfAllowed(card, row)
        }, 0)
      }
    }
  }

  function handleFocus(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null
    if (!input?.matches('.set-input')) return
    userIsEditing = true
    input.closest('.active-exercise')?.classList.add('lmf-logging-compact')
  }

  function handleBlur(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null
    if (!input?.matches('.set-input')) return
    userIsEditing = false
  }

  function start() {
    enhanceAll()
    document.addEventListener('click', handleClick, true)
    document.addEventListener('focusin', handleFocus, true)
    document.addEventListener('focusout', handleBlur, true)
    new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === 'attributes')) schedule(30)
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('hashchange', () => schedule(20))
    window.__LMF_WORKOUT_LOGGING_V2__ = {
      version: 2,
      refresh: enhanceAll,
      autoAdvance: panel => autoAdvance(panel, false),
      protectedProgramLoad,
      exerciseKey,
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
