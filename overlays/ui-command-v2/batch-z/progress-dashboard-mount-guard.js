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
  let progressIntentUntil = 0

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
  }

  function progressRouteActive() {
    if (Date.now() < progressIntentUntil) return true
    if (/^#\/progress(?:[/?#]|$)/i.test(location.hash || '')) return true
    const activeNav = [...document.querySelectorAll('nav a[href],nav button,nav [role="button"]')].find(element => {
      if (!visible(element)) return false
      const href = element.getAttribute('href') || ''
      const text = (element.textContent || '').trim()
      const selected = element.classList.contains('active') || Boolean(element.closest('.active')) || element.getAttribute('aria-current') === 'page' || element.getAttribute('aria-selected') === 'true'
      return selected && (/^#\/progress(?:[/?#]|$)/i.test(href) || /^progress$/i.test(text))
    })
    return Boolean(activeNav)
  }

  function progressTitle() {
    const roots = [document.querySelector('main'), document.querySelector('[role="main"]'), document.querySelector('#app'), document.body].filter(Boolean)
    for (const root of roots) {
      const candidates = root.querySelectorAll(`h1,h2,h3,[${ANCHOR_ATTR}],.page-title,.screen-title,.section-title,[class*="heading"],[class*="title"],strong,span,div`)
      for (const element of candidates) {
        if (!visible(element)) continue
        if ((element.textContent || '').trim().toUpperCase() !== 'PROGRESS') continue
        if (element.closest('nav,button,a,[role="button"],[role="tab"]')) continue
        if (!element.hasAttribute(ANCHOR_ATTR) && element.getBoundingClientRect().width < 24) continue
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
    if (native) {
      const nativeVisible = visible(native) || [...native.querySelectorAll(':scope > *')].some(visible)
      if (nativeVisible) return { title: null, root: native.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || native.parentElement || native }
    }

    const marker = [...document.querySelectorAll('.progress-score-grid,.strength-progress-card,.tm-board,.history-list')].find(visible)
    if (marker) return { title: null, root: marker.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || marker.parentElement }

    // A Progress nav tap is remembered briefly while the SPA replaces the route.
    // That makes the mount deterministic even when neither the hash nor active
    // nav class is updated before the new screen is painted.
    const root = routeRoot()
    return root ? { title: null, root } : null
  }

  function ensureAnchor(surface) {
    if (!surface?.root) return null
    const existing = [...surface.root.querySelectorAll(`[${ANCHOR_ATTR}]`)].find(element => element.isConnected)
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
    if (retrying || document.getElementById(DASHBOARD_ID) || !progressSurface()) return
    if (refreshBaseDashboard()) return
    if (document.querySelector(`script[${RETRY_ATTR}]`)) return
    retrying = true
    const script = document.createElement('script')
    script.defer = true
    script.src = '/ui/progress-dashboard-v1.js?mount-retry=9'
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
    window.setTimeout(queue, 2400)
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
      if (!progressNavTrigger(event.target)) return
      progressIntentUntil = Date.now() + 5000
      pulseRouteMount()
    }, true)
    window.setTimeout(queue, 300)
    window.setTimeout(queue, 850)
    window.setTimeout(queue, 1600)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
