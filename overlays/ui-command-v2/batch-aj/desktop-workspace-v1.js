(() => {
  'use strict'

  // LetMeFly Desktop Workspace v1
  // Presentation only. This layer never writes athlete data, workout state,
  // training-max state, program prescriptions, or exercise-library records.
  // The original LetMeFly controls remain the only mutation/persistence boundary.

  const DESKTOP_QUERY = '(min-width: 1100px)'
  const media = window.matchMedia(DESKTOP_QUERY)
  const state = {
    enabled: false,
    workspace: null,
    viewport: null,
    originalParent: null,
    marker: null,
    contextTab: 'loading',
    refreshTimer: 0,
    refreshing: false,
  }

  function text(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function elementTarget(mutation) {
    const target = mutation?.target
    if (target instanceof Element) return target
    return target?.parentElement || null
  }

  function activeRoute() {
    const active = document.querySelector('.navbar .nav-item.active')
    return slug(text(active)) || 'app'
  }

  function ensureRailBrand() {
    const nav = document.querySelector('.navbar')
    if (!(nav instanceof Element)) return

    if (!nav.querySelector(':scope > .lmf-desktop-brand')) {
      const holder = document.createElement('div')
      holder.className = 'lmf-desktop-brand lmf-desktop-only'
      holder.setAttribute('aria-hidden', 'true')

      const source = document.querySelector('.topbar .brand') || document.querySelector('.brand')
      if (source instanceof Element) {
        const clone = source.cloneNode(true)
        clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
        holder.appendChild(clone)
      } else {
        holder.innerHTML = '<div class="brand"><span class="brand-mark">♛</span><span><b class="brand-word">LetMeFly</b><small>STRENGTH • DISCIPLINE • FREEDOM</small></span></div>'
      }
      nav.insertBefore(holder, nav.firstChild)
    }

    if (!nav.querySelector(':scope > .lmf-desktop-rail-footer')) {
      const footer = document.createElement('div')
      footer.className = 'lmf-desktop-rail-footer lmf-desktop-only'
      footer.setAttribute('aria-hidden', 'true')
      footer.innerHTML = 'Stronger people<br>Further places.'
      nav.appendChild(footer)
    }
  }

  function removeRailExtras() {
    document.querySelectorAll('.lmf-desktop-brand,.lmf-desktop-rail-footer').forEach((node) => node.remove())
  }

  function buildPanel(className, title, subtitle) {
    const panel = document.createElement('aside')
    panel.className = `lmf-desktop-panel ${className} lmf-desktop-only`
    panel.innerHTML = `
      <header class="lmf-desktop-panel-head">
        <div><strong>${title}</strong><small>${subtitle}</small></div>
      </header>
    `
    return panel
  }

  function mountWorkspace() {
    const viewport = document.querySelector('#swipe-viewport')
    if (!(viewport instanceof HTMLElement)) return false

    if (state.workspace?.isConnected && state.viewport === viewport) return true
    unmountWorkspace()

    const parent = viewport.parentElement
    if (!(parent instanceof Element)) return false

    const marker = document.createComment('LetMeFly desktop workspace return point')
    parent.insertBefore(marker, viewport)

    const workspace = document.createElement('section')
    workspace.className = 'lmf-desktop-workspace lmf-desktop-only'
    workspace.setAttribute('data-lmf-desktop-workspace', 'true')

    const flow = buildPanel('lmf-desktop-flow-panel', 'Workout Flow', 'Current programmed section')
    flow.innerHTML += '<div class="lmf-desktop-flow-list"></div>'

    const context = buildPanel('lmf-desktop-context-panel', 'Tools & Context', 'Live workout information')
    context.innerHTML += `
      <div class="lmf-desktop-context-tabs" role="tablist" aria-label="Workout context">
        <button type="button" data-lmf-desktop-tab="loading">Loading</button>
        <button type="button" data-lmf-desktop-tab="tools">Tools</button>
        <button type="button" data-lmf-desktop-tab="context">Context</button>
      </div>
      <div class="lmf-desktop-context-body"></div>
    `

    parent.insertBefore(workspace, viewport)
    workspace.append(flow, viewport, context)

    state.workspace = workspace
    state.viewport = viewport
    state.originalParent = parent
    state.marker = marker

    context.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-lmf-desktop-tab]') : null
      if (!(button instanceof HTMLButtonElement)) return
      const tab = button.dataset.lmfDesktopTab
      if (!['loading', 'tools', 'context'].includes(tab)) return
      state.contextTab = tab
      refreshWorkspace()
    })

    flow.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-lmf-desktop-exercise-index]') : null
      if (!(button instanceof HTMLButtonElement)) return
      const index = Number(button.dataset.lmfDesktopExerciseIndex)
      const cards = activeCards()
      const card = cards[index]
      if (!(card instanceof Element)) return
      const summary = card.querySelector(':scope > .lmf-compact-summary')
      if (summary instanceof HTMLButtonElement) summary.click()
      else {
        const firstControl = card.querySelector('button,[role="button"]')
        if (firstControl instanceof HTMLElement && !card.classList.contains('lmf-flow-active')) firstControl.focus({ preventScroll: true })
      }
      scheduleRefresh(20)
    })

    return true
  }

  function unmountWorkspace() {
    const workspace = state.workspace
    const viewport = state.viewport
    if (workspace instanceof Element && viewport instanceof Element && workspace.contains(viewport)) {
      const parent = workspace.parentElement || state.originalParent
      if (parent instanceof Element) {
        if (state.marker?.parentNode === parent) parent.insertBefore(viewport, state.marker.nextSibling)
        else parent.insertBefore(viewport, workspace)
      }
      workspace.remove()
    } else if (workspace instanceof Element) {
      workspace.remove()
    }
    state.marker?.remove()
    state.workspace = null
    state.viewport = null
    state.originalParent = null
    state.marker = null
  }

  function activePage() {
    const viewport = state.viewport || document.querySelector('#swipe-viewport')
    if (!(viewport instanceof Element)) return null
    return viewport.querySelector(':scope > .swipe-page.active-page')
      || [...viewport.querySelectorAll(':scope > .swipe-page')].find((page) => getComputedStyle(page).display !== 'none')
      || viewport.querySelector(':scope > .swipe-page')
  }

  function activeCards() {
    const page = activePage()
    if (!(page instanceof Element)) return []
    return [...page.querySelectorAll('.exercise-stack > .active-exercise')]
  }

  function cardName(card) {
    return text(card.querySelector('.exercise-title h3'))
      || text(card.querySelector('.lmf-compact-copy b'))
      || 'Programmed exercise'
  }

  function cardPrescription(card) {
    const compact = text(card.querySelector('.lmf-compact-copy small'))
    if (compact) return compact
    const activeRow = card.querySelector('.set-row.lmf-set-active') || card.querySelector('.set-row[data-set-id]')
    if (!(activeRow instanceof Element)) return 'Programmed work'
    const reps = activeRow.querySelector('.reps-input')?.value
    const load = activeRow.querySelector('.load-input')?.value
    const parts = []
    if (reps) parts.push(`${reps} reps`)
    if (load) parts.push(`${load} lb`)
    return parts.join(' • ') || 'Programmed work'
  }

  function cardComplete(card) {
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    return rows.length > 0 && rows.every((row) => row.querySelector('.set-check')?.classList.contains('done'))
  }

  function currentCard(cards = activeCards()) {
    return cards.find((card) => card.classList.contains('lmf-flow-active'))
      || cards.find((card) => !cardComplete(card))
      || cards[0]
      || null
  }

  function renderFlow() {
    const flow = state.workspace?.querySelector('.lmf-desktop-flow-panel')
    const list = flow?.querySelector('.lmf-desktop-flow-list')
    const head = flow?.querySelector('.lmf-desktop-panel-head')
    if (!(list instanceof Element) || !(head instanceof Element)) return

    const page = activePage()
    const cards = activeCards()
    const current = currentCard(cards)
    const sectionTitle = text(page?.querySelector('.workout-panel-head h2')) || text(document.querySelector('#session-label')) || 'Workout section'
    const sectionMeta = text(page?.querySelector('.workout-panel-head .muted')) || 'Current programmed section'
    const done = cards.filter(cardComplete).length

    head.innerHTML = `
      <div><strong>Workout Flow</strong><small>${sectionTitle}${sectionMeta ? ` • ${sectionMeta}` : ''}</small></div>
      <span class="lmf-desktop-progress-pill">${cards.length ? `${done}/${cards.length}` : 'PROGRAM'}</span>
    `

    if (!cards.length) {
      list.innerHTML = '<div class="lmf-desktop-empty">This section has no exercise cards. Use the existing section controls to continue through the programmed workout.</div>'
      return
    }

    list.innerHTML = cards.map((card, index) => {
      const name = cardName(card)
      const prescription = cardPrescription(card)
      const art = card.getAttribute('data-exercise-art') || ''
      const isCurrent = card === current
      const complete = cardComplete(card)
      return `
        <button type="button" class="lmf-desktop-flow-item${isCurrent ? ' is-active' : ''}${complete ? ' is-complete' : ''}" data-lmf-desktop-exercise-index="${index}" aria-current="${isCurrent ? 'step' : 'false'}">
          <span class="lmf-desktop-flow-thumb"${art ? ` data-exercise-art="${art}"` : ''}></span>
          <span class="lmf-desktop-flow-copy"><b>${escapeHtml(name)}</b><small>${escapeHtml(complete ? `Completed • ${prescription}` : prescription)}</small></span>
          <i class="lmf-desktop-flow-arrow" aria-hidden="true">›</i>
        </button>
      `
    }).join('')
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function currentRow(card) {
    if (!(card instanceof Element)) return null
    return card.querySelector('.set-row.lmf-set-active')
      || [...card.querySelectorAll('.set-row[data-set-id]')].find((row) => !row.querySelector('.set-check')?.classList.contains('done'))
      || card.querySelector('.set-row[data-set-id]')
  }

  function loadDetails(card) {
    const row = currentRow(card)
    const load = row?.querySelector('.load-input')?.value || '—'
    const reps = row?.querySelector('.reps-input')?.value || '—'
    const rpe = row?.querySelector('.rpe-input')?.value || '—'
    const plate = text(row?.querySelector('.lmf-plates-line strong'))
      || text(row?.querySelector('[data-lmf-live-load]'))
      || text(row?.querySelector('.load-field small'))
      || 'Bar loading updates from the active Load field.'
    const set = text(row?.querySelector('.set-label strong')) || '—'
    return { load, reps, rpe, plate, set }
  }

  function sectionDetails() {
    const page = activePage()
    return {
      kicker: text(page?.querySelector('.workout-panel-head .page-kicker')),
      title: text(page?.querySelector('.workout-panel-head h2')) || text(document.querySelector('#session-label')) || 'Workout',
      subtitle: text(page?.querySelector('.workout-panel-head .muted')),
    }
  }

  function sourceActions(card) {
    if (!(card instanceof Element)) return []
    return [...card.querySelectorAll('.exercise-actions .btn, .exercise-actions button, .exercise-actions [role="button"]')]
      .filter((node, index, all) => node instanceof HTMLElement && text(node) && all.indexOf(node) === index)
      .slice(0, 6)
  }

  function renderLoading(body, card) {
    if (!(card instanceof Element)) {
      body.innerHTML = '<div class="lmf-desktop-empty">Start or open an exercise section to see live loading information.</div>'
      return
    }
    const details = loadDetails(card)
    body.innerHTML = `
      <div class="lmf-desktop-context-card">
        <small>Active Exercise</small>
        <strong style="font-size:20px">${escapeHtml(cardName(card))}</strong>
        <p>${escapeHtml(cardPrescription(card))}</p>
      </div>
      <div class="lmf-desktop-context-card">
        <small>Current Load</small>
        <strong>${escapeHtml(details.load)}${details.load !== '—' ? ' lb' : ''}</strong>
        <p>Set ${escapeHtml(details.set)} • ${escapeHtml(details.reps)} reps • RPE/RIR ${escapeHtml(details.rpe)}</p>
        <div class="lmf-desktop-plate-readout">${escapeHtml(details.plate)}</div>
      </div>
    `
  }

  function renderTools(body, card) {
    if (!(card instanceof Element)) {
      body.innerHTML = '<div class="lmf-desktop-empty">Exercise tools become available when an exercise card is active.</div>'
      return
    }
    const actions = sourceActions(card)
    body.innerHTML = `
      <div class="lmf-desktop-context-card">
        <small>Exercise Tools</small>
        <div class="lmf-desktop-tool-list">
          ${actions.length ? actions.map((action, index) => `<button type="button" class="lmf-desktop-tool-button${index === 0 ? ' is-primary' : ''}" data-lmf-desktop-forward-action="${index}"><span>${escapeHtml(text(action))}</span><span aria-hidden="true">›</span></button>`).join('') : '<p>No additional exercise actions are exposed by this card.</p>'}
        </div>
      </div>
      <div class="lmf-desktop-context-card">
        <small>Authority</small>
        <p>The buttons here forward to the existing LetMeFly exercise controls. Substitutions, videos, Coach guidance, and workout writes still use the same authoritative runtime.</p>
      </div>
    `
  }

  function renderContext(body, card) {
    const section = sectionDetails()
    const cards = activeCards()
    const done = cards.filter(cardComplete).length
    const rows = card instanceof Element ? [...card.querySelectorAll('.set-row[data-set-id]')] : []
    const setsDone = rows.filter((row) => row.querySelector('.set-check')?.classList.contains('done')).length
    body.innerHTML = `
      <div class="lmf-desktop-context-card">
        <small>Current Section</small>
        <strong style="font-size:20px">${escapeHtml(section.title)}</strong>
        <p>${escapeHtml([section.kicker, section.subtitle].filter(Boolean).join(' • ') || 'Programmed workout section')}</p>
      </div>
      <div class="lmf-desktop-context-card">
        <small>Progress</small>
        <strong>${cards.length ? `${done}/${cards.length}` : '—'}</strong>
        <p>${cards.length ? 'exercises complete in this section' : 'Open an exercise section to track progress.'}${rows.length ? ` • ${setsDone}/${rows.length} sets on ${escapeHtml(cardName(card))}` : ''}</p>
      </div>
      <div class="lmf-desktop-context-card">
        <small>Desktop Mode</small>
        <p>This workspace is a presentation layer only. Crownforge/Black Crown prescriptions, athlete history, set logging, and progression rules are not duplicated or rewritten.</p>
      </div>
    `
  }

  function renderContextPanel() {
    const panel = state.workspace?.querySelector('.lmf-desktop-context-panel')
    const body = panel?.querySelector('.lmf-desktop-context-body')
    if (!(panel instanceof Element) || !(body instanceof Element)) return

    panel.querySelectorAll('[data-lmf-desktop-tab]').forEach((button) => {
      const selected = button.getAttribute('data-lmf-desktop-tab') === state.contextTab
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-selected', selected ? 'true' : 'false')
      button.setAttribute('role', 'tab')
    })

    const card = currentCard()
    if (state.contextTab === 'tools') renderTools(body, card)
    else if (state.contextTab === 'context') renderContext(body, card)
    else renderLoading(body, card)
  }

  function refreshWorkspace() {
    if (!state.enabled || state.refreshing) return
    state.refreshing = true
    try {
      document.documentElement.dataset.lmfDesktopRoute = activeRoute()
      ensureRailBrand()
      if (document.querySelector('#swipe-viewport')) {
        mountWorkspace()
        renderFlow()
        renderContextPanel()
      } else {
        unmountWorkspace()
      }
    } finally {
      state.refreshing = false
    }
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(state.refreshTimer)
    state.refreshTimer = window.setTimeout(refreshWorkspace, delay)
  }

  function activate() {
    if (state.enabled) {
      scheduleRefresh(0)
      return
    }
    state.enabled = true
    document.documentElement.dataset.lmfDesktopUi = 'true'
    document.documentElement.dataset.lmfDesktopRoute = activeRoute()
    ensureRailBrand()
    scheduleRefresh(0)
  }

  function deactivate() {
    if (!state.enabled) return
    state.enabled = false
    window.clearTimeout(state.refreshTimer)
    unmountWorkspace()
    removeRailExtras()
    delete document.documentElement.dataset.lmfDesktopUi
    delete document.documentElement.dataset.lmfDesktopRoute
  }

  function syncMode() {
    if (media.matches) activate()
    else deactivate()
  }

  const observer = new MutationObserver((mutations) => {
    if (!state.enabled || state.refreshing) return
    const meaningful = mutations.some((mutation) => {
      const target = elementTarget(mutation)
      return !(target instanceof Element && target.closest('.lmf-desktop-only'))
    })
    if (meaningful) scheduleRefresh(25)
  })

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] })

  document.addEventListener('input', (event) => {
    if (!state.enabled) return
    if (event.target instanceof Element && event.target.closest('.lmf-desktop-only')) return
    scheduleRefresh(20)
  }, true)

  document.addEventListener('change', (event) => {
    if (!state.enabled) return
    if (event.target instanceof Element && event.target.closest('.lmf-desktop-only')) return
    scheduleRefresh(20)
  }, true)

  document.addEventListener('click', (event) => {
    if (!state.enabled) return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const forward = target.closest('[data-lmf-desktop-forward-action]')
    if (forward instanceof HTMLButtonElement) {
      event.preventDefault()
      const index = Number(forward.dataset.lmfDesktopForwardAction)
      const card = currentCard()
      const action = sourceActions(card)[index]
      if (action instanceof HTMLElement) action.click()
      scheduleRefresh(30)
      return
    }

    const navItem = target.closest('.navbar .nav-item')
    if (navItem instanceof HTMLElement) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      scheduleRefresh(30)
      return
    }

    if (!target.closest('.lmf-desktop-only')) scheduleRefresh(30)
  }, true)

  if (typeof media.addEventListener === 'function') media.addEventListener('change', syncMode)
  else media.addListener(syncMode)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncMode, { once: true })
  else syncMode()
})()
