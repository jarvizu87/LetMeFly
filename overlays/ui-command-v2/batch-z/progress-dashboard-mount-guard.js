(() => {
  'use strict'

  // Route-mount guard for the optional Progress dashboard overlay.
  // Presentation only: it never reads or writes athlete/program data.
  // Installer compatibility marker: window.__LMF_PROGRESS_DASHBOARD__ || document.getElementById(DASHBOARD_ID)
  const DASHBOARD_ID = 'lmf-progress-dashboard-v1'
  const ANCHOR_ATTR = 'data-lmf-progress-anchor'
  const RETRY_ATTR = 'data-lmf-progress-script-retry'
  let queued = false
  let retrying = false

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
  }

  function progressRouteActive() {
    return /^#\/progress(?:[/?#]|$)/i.test(location.hash || '')
  }

  function progressTitle() {
    const roots = [document.querySelector('main'), document.querySelector('#app'), document.body].filter(Boolean)
    for (const root of roots) {
      for (const element of root.querySelectorAll('h1,h2,h3,[data-lmf-progress-anchor]')) {
        if (!visible(element)) continue
        if ((element.textContent || '').trim().toUpperCase() !== 'PROGRESS') continue
        if (element.closest('nav,button,a,[role="button"],[role="tab"]')) continue
        return element
      }
    }
    return null
  }

  function routeRoot() {
    if (!progressRouteActive()) return null
    const candidates = [
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('#app'),
      document.body,
    ].filter(Boolean)
    return candidates.find(visible) || null
  }

  function progressSurface() {
    const title = progressTitle()
    if (title) return { title, root: title.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || title.parentElement }
    const native = document.querySelector('#progress-content')
    if (visible(native)) return { title: null, root: native.parentElement || native }

    // The rebuilt shell can style the visible PROGRESS label as a non-heading
    // element and no longer guarantees #progress-content. The hash route is the
    // authoritative navigation signal in that shell, so mount into the active
    // main app surface rather than depending on presentation markup.
    const root = routeRoot()
    return root ? { title: null, root } : null
  }

  function ensureAnchor(surface) {
    if (!surface?.root) return null
    const existing = surface.root.querySelector(`[${ANCHOR_ATTR}]`)
    if (existing) return existing

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
    if (surface.title) surface.title.insertAdjacentElement('afterend', anchor)
    else surface.root.insertAdjacentElement('afterbegin', anchor)
    return anchor
  }

  function refreshBaseDashboard() {
    const refresh = window.__LMF_PROGRESS_DASHBOARD__?.refresh || window.__LMF_PROGRESS_BOOT__?.refresh
    if (typeof refresh !== 'function') return false
    refresh()
    return true
  }

  function retryBaseDashboard() {
    // If the base runtime already has a live dashboard root, never load its IIFE
    // a second time. Prefer the deterministic boot/dashboard refresh hooks first.
    if (retrying || document.getElementById(DASHBOARD_ID) || !progressSurface()) return
    if (refreshBaseDashboard()) return
    if (document.querySelector(`script[${RETRY_ATTR}]`)) return
    retrying = true
    const script = document.createElement('script')
    script.defer = true
    script.src = '/ui/progress-dashboard-v1.js?mount-retry=6'
    script.setAttribute(RETRY_ATTR, 'true')
    script.addEventListener('load', () => {
      window.setTimeout(() => {
        refreshBaseDashboard()
        retrying = false
      }, 220)
    }, { once: true })
    script.addEventListener('error', () => { retrying = false }, { once: true })
    document.body.appendChild(script)
  }

  function ensureMount() {
    queued = false
    if (document.getElementById(DASHBOARD_ID)) return
    const surface = progressSurface()
    if (!surface) return
    ensureAnchor(surface)

    // A same-route tap can cause the SPA to rebuild Progress without changing
    // location.hash. The original dashboard window hook survives that rebuild,
    // so call it directly rather than waiting for hashchange or heading discovery.
    refreshBaseDashboard()
    const pulse = document.createElement('span')
    pulse.hidden = true
    pulse.setAttribute('data-lmf-progress-mount-pulse', 'true')
    surface.root.appendChild(pulse)
    pulse.remove()

    window.setTimeout(() => {
      if (document.getElementById(DASHBOARD_ID) || !progressSurface()) return
      if (!refreshBaseDashboard()) retryBaseDashboard()
    }, 700)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(ensureMount)
  }

  function pulseRouteMount() {
    queue()
    window.setTimeout(queue, 80)
    window.setTimeout(queue, 260)
    window.setTimeout(queue, 700)
    window.setTimeout(queue, 1400)
  }

  function progressNavTrigger(target) {
    if (!(target instanceof Element)) return null
    const link = target.closest('a[href],button,[role="button"]')
    if (!link) return null
    const href = link.getAttribute('href') || ''
    const text = (link.textContent || '').trim()
    if (/^#\/progress(?:[/?#]|$)/i.test(href)) return link
    if (link.closest('nav') && /^progress$/i.test(text)) return link
    return null
  }

  function start() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', pulseRouteMount)
    window.addEventListener('hashchange', pulseRouteMount)
    document.addEventListener('click', event => {
      if (progressNavTrigger(event.target)) pulseRouteMount()
    }, true)
    window.setTimeout(queue, 300)
    window.setTimeout(queue, 850)
    window.setTimeout(queue, 1600)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
