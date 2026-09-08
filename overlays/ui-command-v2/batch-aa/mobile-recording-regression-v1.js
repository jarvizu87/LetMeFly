(() => {
  'use strict'

  // LetMeFly recording-led mobile regression fixes v2.
  // UI guard only: never changes a program prescription or private athlete position.

  const ROOT_CLASS = 'lmf-preview-mode'
  const PREVIEW_STRONG_PATTERN = /^(Preview position\.|Preview only\.)/i
  let scheduled = false

  function text(node) {
    return (node?.textContent || '').trim()
  }

  function previewWarning() {
    return [...document.querySelectorAll('.callout.warning strong')]
      .find((node) => PREVIEW_STRONG_PATTERN.test(text(node)))
      ?.closest('.callout.warning') || null
  }

  function isPreviewMode() {
    const shell = document.querySelector('.train-shell')
    if (!shell) return false
    return Boolean(previewWarning())
  }

  function ensureLockNote(panel, kind) {
    if (!panel || panel.querySelector(`.lmf-preview-lock-note[data-kind="${kind}"]`)) return
    const note = document.createElement('div')
    note.className = 'lmf-preview-lock-note'
    note.dataset.kind = kind

    const title = document.createElement('strong')
    const copy = document.createElement('span')
    if (kind === 'readiness') {
      title.textContent = 'Preview only — readiness is locked'
      copy.textContent = 'Swipe through the training blocks to review the day. Make this the current governed position before entering readiness or starting/logging the workout.'
    } else {
      title.textContent = 'Preview only — workout start is locked'
      copy.textContent = 'This review page is informational. Use Make Current Position first if this is intentionally the day you are moving to.'
    }
    note.append(title, copy)

    const muted = panel.querySelector('p.muted')
    if (muted?.parentNode) muted.insertAdjacentElement('afterend', note)
    else panel.appendChild(note)
  }

  function lockReadinessPanel(panel) {
    if (!panel) return
    panel.dataset.lmfPreviewLocked = 'true'

    const graphicNumber = panel.querySelector('.readiness-graphic span')
    const graphicLabel = panel.querySelector('.readiness-graphic b')
    const kicker = panel.querySelector('.page-kicker')
    const heading = panel.querySelector('h2')
    const copy = panel.querySelector('p.muted')

    if (graphicNumber) graphicNumber.textContent = '↗'
    if (graphicLabel) graphicLabel.textContent = 'PREVIEW'
    if (kicker) kicker.textContent = 'Program preview'
    if (heading) heading.textContent = 'Review this training day'
    if (copy) copy.textContent = 'Readiness belongs to the athlete’s current governed day. Previewing another day never writes readiness or starts a workout.'

    panel.querySelectorAll('input, textarea, select, [data-action="start-workout"], [data-action="save-readiness"]').forEach((control) => {
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement || control instanceof HTMLButtonElement) {
        control.disabled = true
      }
      control.setAttribute('aria-disabled', 'true')
    })
    ensureLockNote(panel, 'readiness')
  }

  function unlockReadinessPanel(panel) {
    if (!panel || panel.dataset.lmfPreviewLocked !== 'true') return
    delete panel.dataset.lmfPreviewLocked
    panel.querySelectorAll('[aria-disabled="true"]').forEach((control) => {
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement || control instanceof HTMLButtonElement) {
        control.disabled = false
      }
      control.removeAttribute('aria-disabled')
    })
  }

  function lockReviewPanel(panel) {
    if (!panel) return
    const start = panel.querySelector('[data-action="start-workout"]')
    if (start instanceof HTMLButtonElement) {
      start.disabled = true
      start.setAttribute('aria-disabled', 'true')
    }
    ensureLockNote(panel, 'review')
  }

  function clarifyActiveReview(panel, preview) {
    if (!panel || preview) return
    const complete = panel.querySelector('[data-action="complete-workout"]')
    const heading = panel.querySelector('h2')
    if (!(complete instanceof HTMLButtonElement) || !heading) return

    const match = text(heading).match(/^(\d+)\s*\/\s*(\d+)\s+sets logged$/i)
    const existing = panel.querySelector('.lmf-incomplete-review-note')
    if (!match) {
      existing?.remove()
      complete.classList.remove('lmf-end-early')
      return
    }

    const done = Number(match[1])
    const total = Number(match[2])
    const remaining = Math.max(0, total - done)
    if (!remaining) {
      existing?.remove()
      complete.classList.remove('lmf-end-early')
      if (!complete.disabled) complete.textContent = 'COMPLETE WORKOUT'
      return
    }

    if (!complete.disabled) complete.textContent = 'END WORKOUT EARLY'
    complete.classList.add('lmf-end-early')

    let note = existing
    if (!note) {
      note = document.createElement('div')
      note.className = 'lmf-incomplete-review-note'
      const progress = panel.querySelector('.progress-bar')
      if (progress?.parentNode) progress.insertAdjacentElement('afterend', note)
      else heading.insertAdjacentElement('afterend', note)
    }
    note.replaceChildren()
    const strong = document.createElement('strong')
    const copy = document.createElement('span')
    strong.textContent = `${remaining} set${remaining === 1 ? '' : 's'} remaining`
    copy.textContent = 'Use End Workout Early only if you intentionally want to close this session. The existing confirmation still protects the workout record.'
    note.append(strong, copy)
  }

  function reconcilePreviewCards(shell, preview) {
    if (!shell) return
    const cards = [...shell.querySelectorAll('.workout-panel .exercise-stack .preview-card[data-exercise-art]')]
    cards.forEach((card) => {
      const existing = card.querySelector(':scope > .lmf-preview-plan-toggle')
      if (!preview) {
        existing?.remove()
        delete card.dataset.lmfPreviewCollapsed
        return
      }

      let button = existing
      if (!(button instanceof HTMLButtonElement)) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'lmf-preview-plan-toggle'
        button.setAttribute('aria-expanded', 'false')
        button.textContent = 'VIEW FULL PLAN'
        card.dataset.lmfPreviewCollapsed = 'true'
        card.appendChild(button)
      }

      const collapsed = card.dataset.lmfPreviewCollapsed !== 'false'
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      button.textContent = collapsed ? 'VIEW FULL PLAN' : 'HIDE DETAILS'
    })
  }

  function togglePreviewPlan(event) {
    const button = event.target instanceof Element ? event.target.closest('.lmf-preview-plan-toggle') : null
    if (!(button instanceof HTMLButtonElement) || !isPreviewMode()) return false
    const card = button.closest('.preview-card[data-exercise-art]')
    if (!(card instanceof HTMLElement)) return false
    event.preventDefault()
    event.stopPropagation()
    const collapsed = card.dataset.lmfPreviewCollapsed !== 'false'
    card.dataset.lmfPreviewCollapsed = collapsed ? 'false' : 'true'
    button.setAttribute('aria-expanded', collapsed ? 'true' : 'false')
    button.textContent = collapsed ? 'HIDE DETAILS' : 'VIEW FULL PLAN'
    return true
  }

  function markPreviewWarning(warning) {
    document.querySelectorAll('.lmf-preview-position-warning').forEach((node) => node.classList.remove('lmf-preview-position-warning'))
    warning?.classList.add('lmf-preview-position-warning')
  }

  function updateNavigationLabels(preview) {
    const shell = document.querySelector('.train-shell')
    if (!shell) return
    const trackButtons = [...shell.querySelectorAll('#session-track [data-session-index]')]
    const label = shell.querySelector('#session-label')
    if (preview && trackButtons.length) {
      trackButtons[0].textContent = 'PREVIEW'
      if (text(label) === 'READINESS') label.textContent = 'PREVIEW'
      const last = trackButtons.at(-1)
      if (last) last.textContent = 'SUMMARY'
      if (text(label) === 'REVIEW') label.textContent = 'SUMMARY'
    }
  }

  function reconcile() {
    scheduled = false
    const shell = document.querySelector('.train-shell')
    if (!shell) {
      document.documentElement.classList.remove(ROOT_CLASS)
      return
    }

    const warning = previewWarning()
    const preview = Boolean(warning)
    document.documentElement.classList.toggle(ROOT_CLASS, preview)
    markPreviewWarning(warning)
    reconcilePreviewCards(shell, preview)

    const readiness = shell.querySelector('.readiness-panel')
    const review = shell.querySelector('.review-panel')
    if (preview) {
      lockReadinessPanel(readiness)
      lockReviewPanel(review)
    } else {
      unlockReadinessPanel(readiness)
      shell.querySelectorAll('.lmf-preview-lock-note').forEach((node) => node.remove())
      clarifyActiveReview(review, false)
    }
    updateNavigationLabels(preview)
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(reconcile)
  }

  function blockPreviewWrite(event) {
    if (togglePreviewPlan(event)) return
    if (!isPreviewMode()) return
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null
    const action = target?.getAttribute('data-action') || ''
    if (!['start-workout', 'save-readiness'].includes(action)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    schedule()
  }

  function start() {
    reconcile()
    document.addEventListener('click', blockPreviewWrite, true)
    document.addEventListener('submit', blockPreviewWrite, true)

    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)
    window.setTimeout(schedule, 250)
    window.setTimeout(schedule, 1200)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
