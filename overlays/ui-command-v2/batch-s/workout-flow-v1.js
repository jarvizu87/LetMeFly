(() => {
  'use strict'

  // LetMeFly Workout Flow v1
  // Presentation only: this never changes program prescriptions or persisted workout data.
  // Existing LetMeFly set buttons remain the only persistence boundary.

  const GROUP_PATTERN = /\b(circuit|superset|tri[- ]?set|giant set|rounds?)\b/i
  const selectedSetByExercise = new Map()
  const manualExerciseByPanel = new Map()
  const restGateByPanel = new Map()
  let refreshTimer = null

  function text(element) {
    return (element?.textContent || '').trim()
  }

  function exerciseKey(card) {
    return card?.dataset.exerciseId || card?.getAttribute('data-exercise-art') || text(card?.querySelector('.exercise-title h3'))
  }

  function panelKey(panel) {
    const kicker = text(panel.querySelector('.workout-panel-head .page-kicker'))
    const title = text(panel.querySelector('.workout-panel-head h2'))
    return `${kicker}|${title}`
  }

  function rowsFor(card) {
    return [...card.querySelectorAll('.set-row[data-set-id]')]
  }

  function setNumber(row, fallback = 1) {
    const raw = text(row?.querySelector('.set-label strong'))
    const match = raw.match(/\d+/)
    return match ? Number(match[0]) : fallback
  }

  function isDone(row) {
    return row?.querySelector('.set-check')?.classList.contains('done') || false
  }

  function allDone(card) {
    const rows = rowsFor(card)
    return rows.length > 0 && rows.every(isDone)
  }

  function firstIncomplete(card) {
    return rowsFor(card).find((row) => !isDone(row)) || null
  }

  function rowAtRound(card, round) {
    return rowsFor(card).find((row, index) => setNumber(row, index + 1) === round) || null
  }

  function formatInputValue(row, selector) {
    const value = row?.querySelector(selector)?.value
    return value == null ? '' : String(value).trim()
  }

  function prescriptionFor(row) {
    if (!row) return ''
    const reps = formatInputValue(row, '.reps-input')
    const load = formatInputValue(row, '.load-input')
    const pieces = []
    if (reps) pieces.push(`${reps} reps`)
    if (load) pieces.push(`${load} lb`)
    return pieces.join(' • ')
  }

  function ensureMedia(card) {
    if (card.querySelector(':scope > .lmf-exercise-media')) return
    const slug = card.getAttribute('data-exercise-art') || ''
    const media = document.createElement('div')
    media.className = 'lmf-exercise-media'
    media.setAttribute('role', 'img')
    media.setAttribute('aria-label', `${text(card.querySelector('.exercise-title h3')) || 'Exercise'} demonstration image`)
    if (slug) media.setAttribute('data-exercise-art', slug)
    card.insertBefore(media, card.firstChild)
  }

  function adjustInput(input, kind, direction) {
    if (!input) return
    const current = Number.parseFloat(input.value)
    const base = Number.isFinite(current) ? current : 0
    const step = kind === 'rpe' ? 0.5 : kind === 'load' ? 5 : 1
    let next = base + direction * step
    if (kind === 'rpe') next = Math.max(0, Math.min(10, next))
    else next = Math.max(0, next)
    next = Math.round(next * 10) / 10
    input.value = Number.isInteger(next) ? String(next) : next.toFixed(1)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function ensureStepper(field, kind) {
    if (!field || field.querySelector('.lmf-stepper')) return
    const input = field.querySelector('.set-input')
    if (!input) return

    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', '—')

    const wrap = document.createElement('div')
    wrap.className = 'lmf-stepper'

    const minus = document.createElement('button')
    minus.type = 'button'
    minus.className = 'lmf-step-btn'
    minus.textContent = '−'
    minus.setAttribute('aria-label', `Decrease ${kind}`)

    const plus = document.createElement('button')
    plus.type = 'button'
    plus.className = 'lmf-step-btn'
    plus.textContent = '+'
    plus.setAttribute('aria-label', `Increase ${kind}`)

    input.parentNode.insertBefore(wrap, input)
    wrap.append(minus, input, plus)

    minus.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      adjustInput(input, kind, -1)
    })
    plus.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      adjustInput(input, kind, 1)
    })
  }

  function ensurePlateLine(row) {
    if (row.querySelector(':scope > .lmf-plates-line')) return
    const helper = row.querySelector('.load-field small')
    const value = text(helper)
    const line = document.createElement('div')
    line.className = 'lmf-plates-line'
    if (!value) line.classList.add('is-empty')
    line.innerHTML = `<span aria-hidden="true">▰</span><strong>${value || 'Load / bodyweight as prescribed'}</strong>`
    row.appendChild(line)
  }

  function chooseSet(card) {
    const rows = rowsFor(card)
    if (!rows.length) return null
    const key = exerciseKey(card)
    const selectedId = selectedSetByExercise.get(key)
    let row = selectedId ? rows.find((candidate) => candidate.dataset.setId === selectedId) : null
    if (!row) row = rows.find((candidate) => !isDone(candidate)) || rows[rows.length - 1]
    return row
  }

  function scrollActiveTabIntoView(card) {
    const tabs = card.querySelector('.lmf-set-tabs')
    const activeTab = tabs?.querySelector('.lmf-set-tab.active')
    if (!tabs || !activeTab || tabs.scrollWidth <= tabs.clientWidth) return
    window.requestAnimationFrame(() => {
      activeTab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    })
  }

  function selectSet(card, row, remember = false) {
    const rows = rowsFor(card)
    if (!row || !rows.length) return
    const key = exerciseKey(card)
    if (remember) selectedSetByExercise.set(key, row.dataset.setId || '')

    rows.forEach((candidate) => candidate.classList.toggle('lmf-set-active', candidate === row))

    const total = rows.length
    const position = rows.indexOf(row) + 1
    rows.forEach((candidate) => {
      const label = candidate.querySelector('.set-label')
      if (!label) return
      let totalNode = label.querySelector('.lmf-set-total')
      if (!totalNode) {
        totalNode = document.createElement('em')
        totalNode.className = 'lmf-set-total'
        label.appendChild(totalNode)
      }
      totalNode.textContent = candidate === row ? `/ ${total}` : ''
      candidate.setAttribute('aria-hidden', candidate === row ? 'false' : 'true')
    })

    card.querySelectorAll('.lmf-set-tab').forEach((button, index) => {
      const candidate = rows[index]
      button.classList.toggle('active', candidate === row)
      button.classList.toggle('done', isDone(candidate))
      button.setAttribute('aria-selected', candidate === row ? 'true' : 'false')
      button.textContent = isDone(candidate) ? `✓${index + 1}` : String(index + 1)
    })

    const table = card.querySelector('.set-table')
    table?.style.setProperty('--lmf-active-set', String(position))
    table?.style.setProperty('--lmf-set-count', String(total))
    scrollActiveTabIntoView(card)
  }

  function ensureSetTabs(card) {
    const table = card.querySelector('.set-table')
    const rows = rowsFor(card)
    if (!table || rows.length < 2) return

    let tabs = table.querySelector(':scope > .lmf-set-tabs')
    if (!tabs) {
      tabs = document.createElement('div')
      tabs.className = 'lmf-set-tabs'
      tabs.setAttribute('role', 'tablist')
      tabs.setAttribute('aria-label', 'Workout sets')
      table.appendChild(tabs)
    }

    if (tabs.children.length !== rows.length) {
      tabs.replaceChildren()
      rows.forEach((row, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'lmf-set-tab'
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-label', `Set ${index + 1}`)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          selectSet(card, row, true)
        })
        tabs.appendChild(button)
      })
    }
  }

  function enhanceCard(card) {
    if (!(card instanceof Element) || !card.matches('.active-exercise')) return
    ensureMedia(card)

    const rows = rowsFor(card)
    rows.forEach((row) => {
      ensureStepper(row.querySelector('.reps-field'), 'reps')
      ensureStepper(row.querySelector('.load-field'), 'load')
      ensureStepper(row.querySelector('.rpe-field'), 'rpe')
      ensurePlateLine(row)
    })

    ensureSetTabs(card)
    const selected = chooseSet(card)
    if (selected) selectSet(card, selected, false)
    card.classList.add('lmf-workout-flow-card')
  }

  function groupKind(panel) {
    const title = text(panel.querySelector('.workout-panel-head h2'))
    const subtitle = text(panel.querySelector('.workout-panel-head .muted'))
    const combined = `${title} ${subtitle}`
    if (!GROUP_PATTERN.test(combined)) return 'sequential'
    if (/superset/i.test(combined)) return 'superset'
    if (/tri[- ]?set/i.test(combined)) return 'tri-set'
    if (/giant set/i.test(combined)) return 'giant-set'
    return 'circuit'
  }

  function normalizedGroupKind(panel, cards) {
    // Black Crown includes labels such as "CIRCUIT / LOW-INTENSITY WORK" that can
    // legitimately contain only one exercise. A one-card section is not a round flow.
    if (cards.length < 2) return 'sequential'
    return groupKind(panel)
  }

  function currentRound(cards) {
    const incomplete = []
    cards.forEach((card) => {
      rowsFor(card).forEach((row, index) => {
        if (!isDone(row)) incomplete.push(setNumber(row, index + 1))
      })
    })
    return incomplete.length ? Math.min(...incomplete) : null
  }

  function maxRound(cards) {
    const rounds = cards.flatMap((card) => rowsFor(card).map((row, index) => setNumber(row, index + 1)))
    return Math.max(1, ...rounds)
  }

  function actualActiveCard(cards, kind, round) {
    if (kind === 'sequential') return cards.find((card) => !allDone(card)) || null
    if (round == null) return null
    return cards.find((card) => {
      const row = rowAtRound(card, round)
      return row && !isDone(row)
    }) || null
  }

  function ensureCompactSummary(card) {
    let summary = card.querySelector(':scope > .lmf-compact-summary')
    if (summary) return summary
    const slug = card.getAttribute('data-exercise-art') || ''
    summary = document.createElement('button')
    summary.type = 'button'
    summary.className = 'lmf-compact-summary'
    summary.innerHTML = `
      <span class="lmf-compact-thumb"${slug ? ` data-exercise-art="${slug}"` : ''}></span>
      <span class="lmf-compact-copy"><b></b><small></small></span>
      <span class="lmf-compact-state"></span>
      <i aria-hidden="true">›</i>
    `
    summary.addEventListener('click', () => {
      const panel = card.closest('.workout-panel')
      if (!panel) return
      restGateByPanel.delete(panelKey(panel))
      manualExerciseByPanel.set(panelKey(panel), exerciseKey(card))
      updatePanelFlow(panel)
    })
    card.insertBefore(summary, card.firstChild)
    return summary
  }

  function ensureFlowNode(card) {
    let node = card.querySelector(':scope > .lmf-flow-node')
    if (!node) {
      node = document.createElement('span')
      node.className = 'lmf-flow-node'
      card.appendChild(node)
    }
    return node
  }

  function cardDisplayRow(card, kind, round) {
    if (kind === 'sequential') return firstIncomplete(card) || rowsFor(card).at(-1) || null
    return rowAtRound(card, round) || firstIncomplete(card) || rowsFor(card).at(-1) || null
  }

  function updateSummary(card, kind, round, isActualActive) {
    const summary = ensureCompactSummary(card)
    const name = text(card.querySelector('.exercise-title h3'))
    const row = cardDisplayRow(card, kind, round)
    const complete = allDone(card)
    const currentRoundRow = round != null ? rowAtRound(card, round) : null
    const roundDone = !!currentRoundRow && isDone(currentRoundRow)

    summary.querySelector('.lmf-compact-copy b').textContent = name
    summary.querySelector('.lmf-compact-copy small').textContent = prescriptionFor(row) || 'Programmed work'

    const state = summary.querySelector('.lmf-compact-state')
    state.className = 'lmf-compact-state'
    if (complete) {
      state.textContent = 'COMPLETED'
      state.classList.add('complete')
    } else if (roundDone && kind !== 'sequential') {
      state.textContent = `ROUND ${round} ✓`
      state.classList.add('round-done')
    } else if (isActualActive) {
      state.textContent = 'NOW'
      state.classList.add('now')
    } else {
      state.textContent = 'UP NEXT'
      state.classList.add('up-next')
    }
  }

  function nextSequentialTarget(active) {
    const rows = rowsFor(active)
    const current = firstIncomplete(active)
    if (!current) return null
    const index = rows.indexOf(current)
    const nextRow = rows.slice(index + 1).find((row) => !isDone(row))
    return nextRow ? { card: active, row: nextRow, prefix: 'NEXT SET' } : null
  }

  function nextTarget(cards, kind, round, active) {
    if (!active) return null
    const activeIndex = cards.indexOf(active)

    if (kind === 'sequential') {
      const sameCard = nextSequentialTarget(active)
      if (sameCard) return sameCard
      const nextCard = cards.slice(activeIndex + 1).find((card) => !allDone(card))
      return nextCard ? { card: nextCard, row: firstIncomplete(nextCard), prefix: 'NEXT' } : null
    }

    for (let index = activeIndex + 1; index < cards.length; index += 1) {
      const row = rowAtRound(cards[index], round)
      if (row && !isDone(row)) return { card: cards[index], row, prefix: 'NEXT' }
    }

    const nextRound = round == null ? null : round + 1
    if (nextRound != null) {
      const nextCard = cards.find((card) => {
        const row = rowAtRound(card, nextRound)
        return row && !isDone(row)
      })
      if (nextCard) return { card: nextCard, row: rowAtRound(nextCard, nextRound), prefix: `ROUND ${nextRound}` }
    }
    return null
  }

  function restText(panel) {
    const source = `${text(panel.querySelector('.workout-panel-head h2'))} ${text(panel.querySelector('.workout-panel-head .muted'))}`
    const clock = source.match(/\b(?:rest\s*)?(\d{1,2}:\d{2})\b/i)
    if (clock) return clock[1]
    const seconds = source.match(/\b(?:rest\s*)?(\d{2,3})\s*(?:sec|seconds?)\b/i)
    if (seconds) return `${seconds[1]} sec`
    const minutes = source.match(/\b(?:rest\s*)?(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i)
    if (minutes) return `${minutes[1]} min`
    return 'FULL REST'
  }

  function ensurePanelDecor(panel, cards, kind, round, max, actualActive, restGate) {
    const head = panel.querySelector('.workout-panel-head')
    const stack = panel.querySelector('.exercise-stack')
    if (!head || !stack) return

    let badge = head.querySelector('.lmf-round-badge')
    if (!badge) {
      badge = document.createElement('div')
      badge.className = 'lmf-round-badge'
      head.appendChild(badge)
    }

    if (kind === 'sequential') {
      const done = cards.filter(allDone).length
      badge.innerHTML = `<span>EXERCISES</span><strong>${Math.min(done + 1, cards.length)} / ${cards.length}</strong>`
    } else if (restGate) {
      badge.innerHTML = `<span>ROUND ${restGate.completedRound}</span><strong>REST</strong>`
    } else {
      const safeRound = round ?? max
      badge.innerHTML = `<span>ROUND</span><strong>${safeRound} / ${max}</strong>`
    }

    let rest = panel.querySelector(':scope > .lmf-round-rest')
    if (kind !== 'sequential') {
      if (!rest) {
        rest = document.createElement('div')
        rest.className = 'lmf-round-rest'
        panel.appendChild(rest)
      }
      rest.classList.toggle('is-active', !!restGate)
      rest.classList.toggle('is-preview', !restGate)
      if (restGate) {
        rest.innerHTML = `
          <span aria-hidden="true">◷</span>
          <div><b>Round ${restGate.completedRound} Complete</b><small>Take the programmed recovery before Round ${restGate.nextRound}.</small></div>
          <strong>${restText(panel)}</strong>
          <button type="button" data-lmf-rest-continue>Start Round ${restGate.nextRound}</button>
        `
      } else {
        rest.innerHTML = `<span aria-hidden="true">◷</span><div><b>Between Rounds</b><small>Use the programmed recovery before repeating the flow.</small></div><strong>${restText(panel)}</strong>`
      }
    } else if (rest) {
      rest.remove()
    }

    let next = panel.querySelector(':scope > .lmf-next-strip')
    if (!next) {
      next = document.createElement('div')
      next.className = 'lmf-next-strip'
      panel.appendChild(next)
    }

    if (restGate) {
      next.classList.remove('complete')
      next.innerHTML = `<span class="lmf-next-icon">◷</span><div><small>REST NOW</small><b>Round ${restGate.nextRound} starts when you are ready.</b></div><i>›</i>`
      return
    }

    const target = nextTarget(cards, kind, round, actualActive)
    if (!actualActive) {
      next.innerHTML = `<span class="lmf-next-icon">✓</span><div><small>SECTION</small><b>Complete</b></div>`
      next.classList.add('complete')
    } else if (target) {
      const slug = target.card.getAttribute('data-exercise-art') || ''
      const name = text(target.card.querySelector('.exercise-title h3'))
      next.classList.remove('complete')
      next.innerHTML = `<span class="lmf-next-thumb"${slug ? ` data-exercise-art="${slug}"` : ''}></span><div><small>${target.prefix}</small><b>${name}${prescriptionFor(target.row) ? ` — ${prescriptionFor(target.row)}` : ''}</b></div><i>›</i>`
    } else {
      next.classList.remove('complete')
      next.innerHTML = `<span class="lmf-next-icon">→</span><div><small>NEXT</small><b>Finish the current programmed work</b></div>`
    }
  }

  function updatePanelFlow(panel) {
    if (!(panel instanceof Element) || panel.classList.contains('readiness-panel') || panel.classList.contains('review-panel')) return
    const stack = panel.querySelector('.exercise-stack')
    if (!stack) return
    const cards = [...stack.querySelectorAll(':scope > .active-exercise')]
    if (!cards.length) return

    cards.forEach(enhanceCard)

    const kind = normalizedGroupKind(panel, cards)
    if (kind === 'sequential') restGateByPanel.delete(panelKey(panel))
    const round = kind === 'sequential' ? null : currentRound(cards)
    const max = maxRound(cards)

    const gate = restGateByPanel.get(panelKey(panel))
    const restGate = gate && kind !== 'sequential' && round != null && gate.nextRound === round ? gate : null
    if (gate && !restGate) restGateByPanel.delete(panelKey(panel))

    const actualActive = restGate ? null : actualActiveCard(cards, kind, round)
    const manualKey = manualExerciseByPanel.get(panelKey(panel))
    const manualCard = manualKey ? cards.find((card) => exerciseKey(card) === manualKey) : null
    const visualActive = manualCard || actualActive || (restGate ? null : cards.at(-1))

    panel.classList.add('lmf-flow-panel', `lmf-flow-${kind}`)
    panel.classList.toggle('lmf-flow-resting', !!restGate)
    ;['sequential', 'superset', 'tri-set', 'giant-set', 'circuit'].forEach((name) => {
      if (name !== kind) panel.classList.remove(`lmf-flow-${name}`)
    })

    stack.classList.add('lmf-group-flow')

    const kickerText = text(panel.querySelector('.workout-panel-head .page-kicker'))
    const letter = /^[A-Z]/.test(kickerText) ? kickerText[0] : '•'

    cards.forEach((card, index) => {
      const complete = allDone(card)
      const currentRoundRow = round != null ? rowAtRound(card, round) : null
      const roundDone = !!currentRoundRow && isDone(currentRoundRow)
      const node = ensureFlowNode(card)
      node.textContent = letter === '•' ? String(index + 1) : `${letter}${index + 1}`
      node.classList.toggle('complete', complete)
      node.classList.toggle('round-done', !complete && roundDone)
      node.classList.toggle('active', card === actualActive)

      card.classList.toggle('lmf-flow-active', card === visualActive)
      card.classList.toggle('lmf-flow-compact', card !== visualActive)
      card.classList.toggle('lmf-sequence-active', card === actualActive)
      card.classList.toggle('lmf-flow-reviewing', card === visualActive && card !== actualActive)
      card.classList.toggle('lmf-flow-complete', complete)
      updateSummary(card, kind, round, card === actualActive)
    })

    if (visualActive) {
      const desired = kind === 'sequential'
        ? firstIncomplete(visualActive) || rowsFor(visualActive).at(-1)
        : rowAtRound(visualActive, round) || firstIncomplete(visualActive) || rowsFor(visualActive).at(-1)
      if (desired && !selectedSetByExercise.has(exerciseKey(visualActive))) selectSet(visualActive, desired, false)
    }

    ensurePanelDecor(panel, cards, kind, round, max, actualActive, restGate)
  }

  function enhanceAll(root = document) {
    const scope = root instanceof Element ? root : document
    scope.querySelectorAll('.active-exercise').forEach(enhanceCard)
    scope.querySelectorAll('.swipe-page.workout-panel').forEach(updatePanelFlow)
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => enhanceAll(document), delay)
  }

  function start() {
    enhanceAll(document)

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) scheduleRefresh(0)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return

      const restContinue = target.closest('[data-lmf-rest-continue]')
      if (restContinue) {
        event.preventDefault()
        const panel = restContinue.closest('.workout-panel')
        if (!panel) return
        restGateByPanel.delete(panelKey(panel))
        manualExerciseByPanel.delete(panelKey(panel))
        updatePanelFlow(panel)
        return
      }

      const check = target.closest('.set-check[data-action="toggle-set"]')
      if (!check) return
      const row = check.closest('.set-row')
      const card = check.closest('.active-exercise')
      const panel = check.closest('.workout-panel')
      if (!card || !row) return

      const key = exerciseKey(card)
      const rowId = row.dataset.setId || ''
      const cardsBefore = panel ? [...panel.querySelectorAll('.exercise-stack > .active-exercise')] : []
      const kindBefore = panel ? normalizedGroupKind(panel, cardsBefore) : 'sequential'
      const roundBefore = kindBefore === 'sequential' ? null : currentRound(cardsBefore)

      // Inspect the final state after LetMeFly's authoritative toggle handler runs.
      window.setTimeout(() => {
        const nowDone = isDone(row)

        if (nowDone) selectedSetByExercise.delete(key)
        else selectedSetByExercise.set(key, rowId)

        if (panel) {
          const pKey = panelKey(panel)
          manualExerciseByPanel.delete(pKey)

          const cardsAfter = [...panel.querySelectorAll('.exercise-stack > .active-exercise')]
          const kindAfter = normalizedGroupKind(panel, cardsAfter)
          const roundAfter = kindAfter === 'sequential' ? null : currentRound(cardsAfter)

          if (!nowDone) {
            // Reopened work takes priority over a pending between-round gate.
            restGateByPanel.delete(pKey)
          } else if (
            kindAfter !== 'sequential' &&
            roundBefore != null &&
            roundAfter != null &&
            roundAfter > roundBefore
          ) {
            restGateByPanel.set(pKey, { completedRound: roundBefore, nextRound: roundAfter })
          }
        }

        enhanceAll(document)
        window.setTimeout(() => enhanceAll(document), 300)
      }, 0)
    }, true)

    window.addEventListener('lmf:exercise-art-local-loaded', () => scheduleRefresh(0))
    window.addEventListener('lmf:exercise-art-overrides-loaded', () => scheduleRefresh(0))
    window.addEventListener('hashchange', () => scheduleRefresh(0))
    window.setTimeout(() => enhanceAll(document), 300)
    window.setTimeout(() => enhanceAll(document), 1200)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
