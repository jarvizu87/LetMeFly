(() => {
  'use strict'

  // LetMeFly Desktop Workspace v2 polish
  // Presentation-only bridge. It reads the live workout DOM and forwards clicks
  // to the existing authoritative controls. It never writes athlete/program data.

  const DESKTOP_QUERY = '(min-width: 1100px)'
  const media = window.matchMedia(DESKTOP_QUERY)
  let refreshTimer = 0

  function text(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function activePage() {
    const viewport = document.querySelector('#swipe-viewport')
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

  function cardName(card) {
    return text(card?.querySelector('.exercise-title h3'))
      || text(card?.querySelector('.lmf-compact-copy b'))
      || 'Programmed exercise'
  }

  function cardPrescription(card) {
    const compact = text(card?.querySelector('.lmf-compact-copy small'))
    if (compact) return compact
    const row = card?.querySelector('.set-row.lmf-set-active') || card?.querySelector('.set-row[data-set-id]')
    if (!(row instanceof Element)) return 'Programmed work'
    const reps = row.querySelector('.reps-input')?.value
    const load = row.querySelector('.load-input')?.value
    return [reps ? `${reps} reps` : '', load ? `${load} lb` : ''].filter(Boolean).join(' • ') || 'Programmed work'
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
    const set = text(row?.querySelector('.set-label strong')) || '—'
    const plate = text(row?.querySelector('.lmf-plates-line strong'))
      || text(row?.querySelector('[data-lmf-live-load]'))
      || text(row?.querySelector('.load-field small'))
      || 'Bar loading follows the active Load field.'
    return { load, reps, rpe, set, plate }
  }

  function sourceActions(card) {
    if (!(card instanceof Element)) return []

    const primary = [...card.querySelectorAll('.exercise-actions button, .exercise-actions .btn, .exercise-actions [role="button"]')]
      .filter((node, index, all) => node instanceof HTMLElement && all.indexOf(node) === index && (text(node) || node.getAttribute('aria-label')))

    if (primary.length) return primary.slice(0, 8)

    return [...card.querySelectorAll('button[data-watch],button[data-exercise-info],button[data-substitute],button[data-action="go-coach"]')]
      .filter((node, index, all) => node instanceof HTMLElement && all.indexOf(node) === index)
      .slice(0, 8)
  }

  function actionLabel(action) {
    const label = text(action) || action.getAttribute('aria-label') || 'Exercise tool'
    return label.replace(/\s+/g, ' ').trim()
  }

  function sectionDetails() {
    const page = activePage()
    return {
      title: text(page?.querySelector('.workout-panel-head h2')) || text(document.querySelector('#session-label')) || 'Workout',
      subtitle: text(page?.querySelector('.workout-panel-head .muted')) || 'Current programmed section',
    }
  }

  function renderEmpty(body) {
    const section = sectionDetails()
    const signature = `empty:${section.title}:${section.subtitle}`
    if (body.dataset.lmfDesktopV2Signature === signature) return

    body.innerHTML = `
      <div class="lmf-desktop-context-card">
        <small>Current Section</small>
        <strong style="font-size:20px">${escapeHtml(section.title)}</strong>
        <p>${escapeHtml(section.subtitle)}</p>
      </div>
      <div class="lmf-desktop-context-card">
        <small>Workout Tools</small>
        <p>Live loading, plates, Watch Exercise, Exercise Info, Substitute, and Ask Coach appear here as soon as you enter an exercise block.</p>
      </div>
    `
    body.dataset.lmfDesktopV2Signature = signature
  }

  function renderLive(body, card) {
    const cards = activeCards()
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    const doneExercises = cards.filter(cardComplete).length
    const doneSets = rows.filter((row) => row.querySelector('.set-check')?.classList.contains('done')).length
    const details = loadDetails(card)
    const actions = sourceActions(card)
    const section = sectionDetails()
    const signature = [
      cardName(card), cardPrescription(card), details.load, details.reps, details.rpe, details.set, details.plate,
      doneExercises, cards.length, doneSets, rows.length, section.title, actions.map(actionLabel).join('|')
    ].join('::')

    if (body.dataset.lmfDesktopV2Signature === signature) return

    body.innerHTML = `
      <div class="lmf-desktop-context-card">
        <small>Active Exercise</small>
        <strong style="font-size:20px">${escapeHtml(cardName(card))}</strong>
        <p>${escapeHtml(cardPrescription(card))}</p>
      </div>

      <div class="lmf-desktop-context-card">
        <small>Live Set</small>
        <div class="lmf-desktop-live-set-grid">
          <div class="lmf-desktop-live-metric"><small>Load</small><strong>${escapeHtml(details.load)}${details.load !== '—' ? ' lb' : ''}</strong></div>
          <div class="lmf-desktop-live-metric"><small>Reps</small><strong>${escapeHtml(details.reps)}</strong></div>
          <div class="lmf-desktop-live-metric"><small>RPE/RIR</small><strong>${escapeHtml(details.rpe)}</strong></div>
        </div>
        <div class="lmf-desktop-plate-readout"><strong>Set ${escapeHtml(details.set)}</strong><br>${escapeHtml(details.plate)}</div>
      </div>

      <div class="lmf-desktop-context-card">
        <small>Exercise Tools</small>
        <div class="lmf-desktop-v2-tools">
          ${actions.length
            ? actions.map((action, index) => `<button type="button" class="lmf-desktop-v2-tool" data-lmf-desktop-v2-action="${index}"><span>${escapeHtml(actionLabel(action))}</span><span aria-hidden="true">›</span></button>`).join('')
            : '<p>No exercise actions are exposed by this card yet.</p>'}
        </div>
      </div>

      <div class="lmf-desktop-context-card">
        <small>Section Progress</small>
        <div class="lmf-desktop-v2-progress-row">
          <strong>${doneExercises}/${cards.length}</strong>
          <span>${doneSets}/${rows.length || 0} sets on current exercise<br>${escapeHtml(section.title)}</span>
        </div>
      </div>
    `
    body.dataset.lmfDesktopV2Signature = signature
  }

  function render() {
    if (!media.matches) return
    const panel = document.querySelector('.lmf-desktop-context-panel')
    const body = panel?.querySelector('.lmf-desktop-context-body')
    if (!(panel instanceof Element) || !(body instanceof HTMLElement)) return

    panel.classList.add('lmf-desktop-context-panel-v2')
    const card = currentCard()
    if (card instanceof Element) renderLive(body, card)
    else renderEmpty(body)
  }

  function schedule(delay = 0) {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(render, delay)
  }

  document.addEventListener('click', (event) => {
    if (!media.matches) return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const forward = target.closest('[data-lmf-desktop-v2-action]')
    if (forward instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      const index = Number(forward.dataset.lmfDesktopV2Action)
      const action = sourceActions(currentCard())[index]
      if (action instanceof HTMLElement) action.click()
      schedule(35)
      return
    }

    if (!target.closest('.lmf-desktop-context-panel')) schedule(35)
  }, true)

  document.addEventListener('input', (event) => {
    if (!media.matches) return
    if (event.target instanceof Element && event.target.closest('.lmf-desktop-context-panel')) return
    schedule(20)
  }, true)

  document.addEventListener('change', (event) => {
    if (!media.matches) return
    if (event.target instanceof Element && event.target.closest('.lmf-desktop-context-panel')) return
    schedule(20)
  }, true)

  const observer = new MutationObserver((mutations) => {
    if (!media.matches) return
    const meaningful = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement
      return !(target instanceof Element && target.closest('.lmf-desktop-context-panel'))
    })
    if (meaningful) schedule(30)
  })

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value', 'checked'] })

  if (typeof media.addEventListener === 'function') media.addEventListener('change', () => schedule(0))
  else media.addListener(() => schedule(0))

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true })
  else schedule(0)
})()
