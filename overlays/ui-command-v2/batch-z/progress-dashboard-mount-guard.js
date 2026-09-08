(() => {
  'use strict'

  // Route-mount guard for the optional Progress dashboard overlay.
  // Presentation only: it never reads or writes athlete/program data.
  const DASHBOARD_ID = 'lmf-progress-dashboard-v1'
  const ANCHOR_ATTR = 'data-lmf-progress-anchor'
  let queued = false

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
  }

  function progressTitle() {
    const roots = [document.querySelector('main'), document.querySelector('#app'), document.body].filter(Boolean)
    for (const root of roots) {
      for (const element of root.querySelectorAll('*')) {
        if (!visible(element)) continue
        if ((element.textContent || '').trim().toUpperCase() !== 'PROGRESS') continue
        if (element.closest('nav,button,a,[role="button"],[role="tab"]')) continue
        return element
      }
    }
    return null
  }

  function ensureAnchor() {
    queued = false
    if (document.getElementById(DASHBOARD_ID)) return
    const title = progressTitle()
    if (!title) return
    const root = title.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || title.parentElement
    if (!root || root.querySelector(`[${ANCHOR_ATTR}]`)) return

    const anchor = document.createElement('h2')
    anchor.setAttribute(ANCHOR_ATTR, 'true')
    anchor.textContent = 'PROGRESS'
    anchor.setAttribute('aria-hidden', 'true')
    Object.assign(anchor.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '0',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    })
    title.insertAdjacentElement('afterend', anchor)

    // The base dashboard observer reacts to this DOM mutation. If the route had
    // a non-semantic title, this visible-layout anchor also gives it the h2 it expects.
    window.setTimeout(() => {
      window.__LMF_PROGRESS_DASHBOARD__?.refresh?.()
    }, 220)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(ensureAnchor)
  }

  function start() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', queue)
    window.setTimeout(queue, 400)
    window.setTimeout(queue, 1100)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
